/**
 * Folder Management Tools - Organize Files and Slideshows
 *
 * Folders provide hierarchical organization for media files and slideshows.
 * Supports nested structures with media-type-specific folders.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export type MediaType = 'ai_image' | 'ai_video' | 'upload' | 'slideshow';

export type FolderVisibility = 'private' | 'workspace' | 'public';

export type FolderItem = {
  id: string;
  type: 'file' | 'slideshow';
  addedAt: string;
  metadata?: Record<string, unknown>;
};

export type Folder = {
  id: string;
  name: string;
  mediaType: MediaType;
  parentFolderId?: string;
  description?: string;
  items: FolderItem[];
  visibility: FolderVisibility;
  createdAt: string;
  updatedAt: string;
};

export type FolderManagerConfig = {
  foldersDir?: string;
};

/**
 * Load all folders from storage
 */
async function loadFolders(foldersDir: string): Promise<Map<string, Folder>> {
  const folders = new Map<string, Folder>();

  try {
    const files = await fs.readdir(foldersDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(join(foldersDir, file), 'utf-8');
        const folder: Folder = JSON.parse(content);
        folders.set(folder.id, folder);
      }
    }
  } catch (error) {
    // Directory doesn't exist yet
    await fs.mkdir(foldersDir, { recursive: true });
  }

  return folders;
}

/**
 * Save folder to storage
 */
async function saveFolder(folder: Folder, foldersDir: string): Promise<void> {
  await fs.mkdir(foldersDir, { recursive: true });
  await fs.writeFile(
    join(foldersDir, `${folder.id}.json`),
    JSON.stringify(folder, null, 2),
    'utf-8',
  );
}

/**
 * Get all descendants of a folder (for circular reference checks)
 */
function getDescendantIds(
  folderId: string,
  folders: Map<string, Folder>,
): Set<string> {
  const descendants = new Set<string>();
  const queue = [folderId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const folder of folders.values()) {
      if (folder.parentFolderId === currentId) {
        descendants.add(folder.id);
        queue.push(folder.id);
      }
    }
  }

  return descendants;
}

/**
 * Create a new folder (optionally nested)
 */
export async function createFolder(
  name: string,
  mediaType: MediaType,
  options: {
    parentFolderId?: string;
    description?: string;
    visibility?: FolderVisibility;
  } = {},
  managerConfig: FolderManagerConfig = {},
): Promise<Folder> {
  const foldersDir = managerConfig.foldersDir || './var/folders';
  const folders = await loadFolders(foldersDir);

  // Validate parent folder exists if specified
  if (options.parentFolderId) {
    const parent = folders.get(options.parentFolderId);
    if (!parent) {
      throw new Error(`Parent folder not found: ${options.parentFolderId}`);
    }
    // Ensure media type matches parent
    if (parent.mediaType !== mediaType) {
      throw new Error(
        `Media type mismatch: parent folder is ${parent.mediaType}, cannot create ${mediaType} folder inside`,
      );
    }
  }

  // Check for name conflict at same level
  const existingAtLevel = [...folders.values()].find(
    f => f.name === name && f.parentFolderId === options.parentFolderId && f.mediaType === mediaType,
  );
  if (existingAtLevel) {
    throw new Error(`Folder name conflict: "${name}" already exists at this location`);
  }

  const folder: Folder = {
    id: randomUUID(),
    name,
    mediaType,
    parentFolderId: options.parentFolderId,
    description: options.description,
    items: [],
    visibility: options.visibility || 'private',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  folders.set(folder.id, folder);
  await saveFolder(folder, foldersDir);

  return folder;
}

/**
 * List folders at a given hierarchy level
 */
export async function listFolders(
  mediaType: MediaType,
  options: {
    parentFolderId?: string;
    limit?: number;
    offset?: number;
  } = {},
  managerConfig: FolderManagerConfig = {},
): Promise<{ folders: Folder[]; total: number }> {
  const foldersDir = managerConfig.foldersDir || './var/folders';
  const foldersMap = await loadFolders(foldersDir);
  let folders = Array.from(foldersMap.values());

  // Filter by media type
  folders = folders.filter(f => f.mediaType === mediaType);

  // Filter by parent folder (null for root)
  if (options.parentFolderId === undefined) {
    folders = folders.filter(f => !f.parentFolderId);
  } else {
    folders = folders.filter(f => f.parentFolderId === options.parentFolderId);
  }

  // Sort by name
  folders.sort((a, b) => a.name.localeCompare(b.name));

  const total = folders.length;

  // Apply pagination
  if (options.offset) folders = folders.slice(options.offset);
  if (options.limit) folders = folders.slice(0, options.limit);

  return { folders, total };
}

/**
 * Get a single folder with computed stats
 */
export async function getFolder(
  folderId: string,
  managerConfig: FolderManagerConfig = {},
): Promise<(Folder & { fileCount: number; subfolderCount: number }) | null> {
  const foldersDir = managerConfig.foldersDir || './var/folders';
  const folders = await loadFolders(foldersDir);
  const folder = folders.get(folderId);

  if (!folder) return null;

  // Count subfolders
  const subfolderCount = Array.from(folders.values()).filter(
    f => f.parentFolderId === folderId,
  ).length;

  return {
    ...folder,
    fileCount: folder.items.length,
    subfolderCount,
  };
}

/**
 * Move a folder to a new parent or to root
 */
export async function moveFolder(
  folderId: string,
  options: {
    parentFolderId?: string;
    toRoot?: boolean;
  },
  managerConfig: FolderManagerConfig = {},
): Promise<Folder | null> {
  const foldersDir = managerConfig.foldersDir || './var/folders';
  const folders = await loadFolders(foldersDir);
  const folder = folders.get(folderId);

  if (!folder) return null;

  // Determine new parent
  const newParentId = options.toRoot ? undefined : options.parentFolderId;

  // Validate new parent if specified
  if (newParentId) {
    const newParent = folders.get(newParentId);
    if (!newParent) {
      throw new Error(`Target parent folder not found: ${newParentId}`);
    }

    // Can't move into self
    if (newParentId === folderId) {
      throw new Error('Cannot move folder into itself');
    }

    // Can't move into a descendant
    const descendants = getDescendantIds(folderId, folders);
    if (descendants.has(newParentId)) {
      throw new Error('Cannot move folder into one of its descendants');
    }

    // Media type must match
    if (newParent.mediaType !== folder.mediaType) {
      throw new Error(
        `Media type mismatch: cannot move ${folder.mediaType} folder into ${newParent.mediaType} folder`,
      );
    }

    // Check for name conflict at new location
    const existingAtTarget = Array.from(folders.values()).find(
      f => f.id !== folderId && f.name === folder.name && f.parentFolderId === newParentId,
    );
    if (existingAtTarget) {
      throw new Error(`Folder name conflict: "${folder.name}" already exists at target location`);
    }
  }

  folder.parentFolderId = newParentId;
  folder.updatedAt = new Date().toISOString();

  await saveFolder(folder, foldersDir);
  return folder;
}

/**
 * Delete a folder and cascade to subfolders
 * Note: Items (files/slideshows) are removed from folder but NOT deleted from platform
 */
export async function deleteFolder(
  folderId: string,
  managerConfig: FolderManagerConfig = {},
): Promise<{ deleted: boolean; deletedFolderIds: string[]; removedItemCount: number }> {
  const foldersDir = managerConfig.foldersDir || './var/folders';
  const folders = await loadFolders(foldersDir);
  const folder = folders.get(folderId);

  if (!folder) {
    return { deleted: false, deletedFolderIds: [], removedItemCount: 0 };
  }

  // Get all descendants (for cascade delete)
  const descendants = getDescendantIds(folderId, folders);
  const allFolderIds = [folderId, ...Array.from(descendants)];

  let totalItems = 0;
  const deletedFolderIds: string[] = [];

  // Delete all folders in hierarchy
  for (const id of allFolderIds) {
    const f = folders.get(id);
    if (f) {
      totalItems += f.items.length;
      deletedFolderIds.push(id);
      folders.delete(id);
      await fs.unlink(join(foldersDir, `${id}.json`)).catch(() => {});
    }
  }

  return {
    deleted: true,
    deletedFolderIds,
    removedItemCount: totalItems,
  };
}

/**
 * Get ancestor chain (breadcrumb) from root to folder
 */
export async function getFolderAncestors(
  folderId: string,
  managerConfig: FolderManagerConfig = {},
): Promise<Array<{ id: string; name: string; parentFolderId?: string; depth: number }>> {
  const foldersDir = managerConfig.foldersDir || './var/folders';
  const folders = await loadFolders(foldersDir);

  const ancestors: Array<{ id: string; name: string; parentFolderId?: string; depth: number }> = [];
  let current = folders.get(folderId);

  if (!current) return [];

  // Walk up the tree
  while (current) {
    ancestors.unshift({
      id: current.id,
      name: current.name,
      parentFolderId: current.parentFolderId,
      depth: ancestors.length,
    });

    if (current.parentFolderId) {
      current = folders.get(current.parentFolderId);
    } else {
      break;
    }
  }

  return ancestors;
}

/**
 * List items inside a folder
 */
export async function listFolderItems(
  folderId: string,
  options: {
    limit?: number;
    offset?: number;
  } = {},
  managerConfig: FolderManagerConfig = {},
): Promise<{ items: FolderItem[]; total: number }> {
  const foldersDir = managerConfig.foldersDir || './var/folders';
  const folders = await loadFolders(foldersDir);
  const folder = folders.get(folderId);

  if (!folder) {
    throw new Error(`Folder not found: ${folderId}`);
  }

  let items = [...folder.items];
  const total = items.length;

  // Sort by added date (newest first)
  items.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());

  // Apply pagination
  if (options.offset) items = items.slice(options.offset);
  if (options.limit) items = items.slice(0, options.limit);

  return { items, total };
}

/**
 * Add items to a folder
 */
export async function addFolderItems(
  folderId: string,
  itemIds: string[],
  options: {
    itemType?: 'file' | 'slideshow';
  } = {},
  managerConfig: FolderManagerConfig = {},
): Promise<Folder | null> {
  const foldersDir = managerConfig.foldersDir || './var/folders';
  const folders = await loadFolders(foldersDir);
  const folder = folders.get(folderId);

  if (!folder) return null;

  // Determine item type from folder media type
  const itemType: 'file' | 'slideshow' =
    options.itemType || (folder.mediaType === 'slideshow' ? 'slideshow' : 'file');

  // Add new items (avoid duplicates)
  const existingIds = new Set(folder.items.map(i => i.id));
  const now = new Date().toISOString();

  for (const id of itemIds) {
    if (!existingIds.has(id)) {
      folder.items.push({
        id,
        type: itemType,
        addedAt: now,
      });
    }
  }

  folder.updatedAt = now;
  await saveFolder(folder, foldersDir);

  return folder;
}

/**
 * Remove items from a folder
 */
export async function removeFolderItems(
  folderId: string,
  itemIds: string[],
  managerConfig: FolderManagerConfig = {},
): Promise<Folder | null> {
  const foldersDir = managerConfig.foldersDir || './var/folders';
  const folders = await loadFolders(foldersDir);
  const folder = folders.get(folderId);

  if (!folder) return null;

  const idsToRemove = new Set(itemIds);
  const before = folder.items.length;

  folder.items = folder.items.filter(item => !idsToRemove.has(item.id));
  folder.updatedAt = new Date().toISOString();

  await saveFolder(folder, foldersDir);

  return folder;
}

// ============================================================================
// OpenClaw Tool Definitions
// ============================================================================

export const createFolderTool = {
  name: 'create_folder',
  description: 'Create a new folder for organizing media files or slideshows. Can be nested under a parent folder.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Folder name (1-255 characters)',
      },
      media_type: {
        type: 'string',
        enum: ['ai_image', 'ai_video', 'upload', 'slideshow'],
        description: 'Type of media this folder will contain',
      },
      parent_folder_id: {
        type: 'string',
        description: 'Parent folder ID for nested folders (optional)',
      },
      description: {
        type: 'string',
        description: 'Folder description (optional)',
      },
      visibility: {
        type: 'string',
        enum: ['private', 'workspace', 'public'],
        description: 'Folder visibility (default: private)',
      },
    },
    required: ['name', 'media_type'],
  },
};

export const listFoldersTool = {
  name: 'list_folders',
  description: 'List folders at a specific hierarchy level. Omit parent_folder_id for root-level folders.',
  parameters: {
    type: 'object',
    properties: {
      media_type: {
        type: 'string',
        enum: ['ai_image', 'ai_video', 'upload', 'slideshow'],
        description: 'Filter by media type',
      },
      parent_folder_id: {
        type: 'string',
        description: 'List subfolders of this folder (omit for root)',
      },
      limit: {
        type: 'number',
        description: 'Max folders to return (default: 50)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default: 0)',
      },
    },
    required: ['media_type'],
  },
};

export const getFolderTool = {
  name: 'get_folder',
  description: 'Get folder details including item count and subfolder count',
  parameters: {
    type: 'object',
    properties: {
      folder_id: {
        type: 'string',
        description: 'Folder ID',
      },
    },
    required: ['folder_id'],
  },
};

export const moveFolderTool = {
  name: 'move_folder',
  description: 'Move a folder to a new parent or promote to root level',
  parameters: {
    type: 'object',
    properties: {
      folder_id: {
        type: 'string',
        description: 'Folder ID to move',
      },
      parent_folder_id: {
        type: 'string',
        description: 'New parent folder ID',
      },
      to_root: {
        type: 'boolean',
        description: 'Move to root level (cannot be used with parent_folder_id)',
      },
    },
    required: ['folder_id'],
  },
};

export const deleteFolderTool = {
  name: 'delete_folder',
  description: 'Delete a folder and all subfolders. Items are removed from folder but NOT deleted from platform.',
  parameters: {
    type: 'object',
    properties: {
      folder_id: {
        type: 'string',
        description: 'Folder ID to delete',
      },
    },
    required: ['folder_id'],
  },
};

export const folderAncestorsTool = {
  name: 'folder_ancestors',
  description: 'Get breadcrumb trail from root to the specified folder',
  parameters: {
    type: 'object',
    properties: {
      folder_id: {
        type: 'string',
        description: 'Folder ID',
      },
    },
    required: ['folder_id'],
  },
};

export const folderItemsTool = {
  name: 'folder_items',
  description: 'List items (files or slideshows) inside a folder',
  parameters: {
    type: 'object',
    properties: {
      folder_id: {
        type: 'string',
        description: 'Folder ID',
      },
      limit: {
        type: 'number',
        description: 'Max items to return (default: 50)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default: 0)',
      },
    },
    required: ['folder_id'],
  },
};

export const folderItemsAddTool = {
  name: 'folder_items_add',
  description: 'Add files or slideshows to a folder. Item type must match folder media_type.',
  parameters: {
    type: 'object',
    properties: {
      folder_id: {
        type: 'string',
        description: 'Folder ID',
      },
      item_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of item IDs to add',
      },
      item_type: {
        type: 'string',
        enum: ['file', 'slideshow'],
        description: 'Type of items being added (default: inferred from folder)',
      },
    },
    required: ['folder_id', 'item_ids'],
  },
};

export const folderItemsRemoveTool = {
  name: 'folder_items_remove',
  description: 'Remove items from a folder. Does not delete the underlying files/slideshows.',
  parameters: {
    type: 'object',
    properties: {
      folder_id: {
        type: 'string',
        description: 'Folder ID',
      },
      item_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of item IDs to remove',
      },
    },
    required: ['folder_id', 'item_ids'],
  },
};

// ============================================================================
// Tool Factory Functions
// ============================================================================

function toFolderManagerConfig(config: any): FolderManagerConfig {
  return {
    foldersDir: config.foldersDir,
  };
}

export function createCreateFolderTool(config: any = {}) {
  const managerConfig = toFolderManagerConfig(config);
  return {
    ...createFolderTool,
    execute: async (params: any) =>
      createFolder(params.name, params.media_type, {
        parentFolderId: params.parent_folder_id,
        description: params.description,
        visibility: params.visibility,
      }, managerConfig),
  };
}

export function createListFoldersTool(config: any = {}) {
  const managerConfig = toFolderManagerConfig(config);
  return {
    ...listFoldersTool,
    execute: async (params: any) =>
      listFolders(params.media_type, {
        parentFolderId: params.parent_folder_id,
        limit: params.limit,
        offset: params.offset,
      }, managerConfig),
  };
}

export function createGetFolderTool(config: any = {}) {
  const managerConfig = toFolderManagerConfig(config);
  return {
    ...getFolderTool,
    execute: async (params: any) =>
      getFolder(params.folder_id, managerConfig),
  };
}

export function createMoveFolderTool(config: any = {}) {
  const managerConfig = toFolderManagerConfig(config);
  return {
    ...moveFolderTool,
    execute: async (params: any) =>
      moveFolder(params.folder_id, {
        parentFolderId: params.parent_folder_id,
        toRoot: params.to_root,
      }, managerConfig),
  };
}

export function createDeleteFolderTool(config: any = {}) {
  const managerConfig = toFolderManagerConfig(config);
  return {
    ...deleteFolderTool,
    execute: async (params: any) =>
      deleteFolder(params.folder_id, managerConfig),
  };
}

export function createFolderAncestorsTool(config: any = {}) {
  const managerConfig = toFolderManagerConfig(config);
  return {
    ...folderAncestorsTool,
    execute: async (params: any) =>
      getFolderAncestors(params.folder_id, managerConfig),
  };
}

export function createFolderItemsTool(config: any = {}) {
  const managerConfig = toFolderManagerConfig(config);
  return {
    ...folderItemsTool,
    execute: async (params: any) =>
      listFolderItems(params.folder_id, {
        limit: params.limit,
        offset: params.offset,
      }, managerConfig),
  };
}

export function createFolderItemsAddTool(config: any = {}) {
  const managerConfig = toFolderManagerConfig(config);
  return {
    ...folderItemsAddTool,
    execute: async (params: any) =>
      addFolderItems(params.folder_id, params.item_ids, {
        itemType: params.item_type,
      }, managerConfig),
  };
}

export function createFolderItemsRemoveTool(config: any = {}) {
  const managerConfig = toFolderManagerConfig(config);
  return {
    ...folderItemsRemoveTool,
    execute: async (params: any) =>
      removeFolderItems(params.folder_id, params.item_ids, managerConfig),
  };
}
