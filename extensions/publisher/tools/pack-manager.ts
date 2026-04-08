/**
 * Pack Management Tools - Image Pack System
 *
 * Packs are collections of background images for slideshow generation.
 * Each image has AI-generated metadata (description + keywords).
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export type PackConfig = {
  packsDir?: string;
  generateMetadata?: boolean;
};

export type ImageMetadata = {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  description: string;
  keywords: string[];
  model?: string;
  generatedAt?: string;
  error?: string;
};

export type PackImage = {
  id: string;
  url: string;
  filename: string;
  metadata: ImageMetadata;
  createdAt: string;
};

export type Pack = {
  id: string;
  name: string;
  description?: string;
  images: PackImage[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Generate AI metadata for an image using Gemini
 */
async function generateImageMetadata(
  imageUrl: string,
  geminiClient?: any,
): Promise<ImageMetadata> {
  if (!geminiClient) {
    return {
      status: 'pending',
      description: '',
      keywords: [],
    };
  }

  try {
    const prompt = `Analyze this image and provide:
1. A one-sentence description of what's in the image (max 100 chars)
2. 5-10 lowercase keywords that would help search for this image

Format your response as JSON:
{"description": "...", "keywords": ["keyword1", "keyword2", ...]}`;

    // This would call Gemini Vision API
    // For now, return pending status
    return {
      status: 'pending',
      description: '',
      keywords: [],
    };
  } catch (error) {
    return {
      status: 'failed',
      description: '',
      keywords: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Load all packs from storage
 */
async function loadPacks(packsDir: string): Promise<Map<string, Pack>> {
  const packs = new Map<string, Pack>();

  try {
    const files = await fs.readdir(packsDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(join(packsDir, file), 'utf-8');
        const pack: Pack = JSON.parse(content);
        packs.set(pack.id, pack);
      }
    }
  } catch (error) {
    // Directory doesn't exist yet
    await fs.mkdir(packsDir, { recursive: true });
  }

  return packs;
}

/**
 * Save pack to storage
 */
async function savePack(pack: Pack, packsDir: string): Promise<void> {
  await fs.mkdir(packsDir, { recursive: true });
  await fs.writeFile(
    join(packsDir, `${pack.id}.json`),
    JSON.stringify(pack, null, 2),
    'utf-8',
  );
}

/**
 * Create a new pack
 */
export async function createPack(
  name: string,
  options: {
    description?: string;
    isPublic?: boolean;
  } = {},
  config: PackConfig = {},
): Promise<Pack> {
  const packsDir = config.packsDir || './var/packs';
  const packs = await loadPacks(packsDir);

  const pack: Pack = {
    id: randomUUID(),
    name,
    description: options.description,
    images: [],
    isPublic: options.isPublic || false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  packs.set(pack.id, pack);
  await savePack(pack, packsDir);

  return pack;
}

/**
 * List packs with optional search
 */
export async function listPacks(
  options: {
    search?: string;
    includePublic?: boolean;
    limit?: number;
    offset?: number;
  } = {},
  config: PackConfig = {},
): Promise<{ packs: Pack[]; total: number }> {
  const packsDir = config.packsDir || './var/packs';
  const packsMap = await loadPacks(packsDir);
  let packs = Array.from(packsMap.values());

  // Filter by public/private
  if (options.includePublic === false) {
    packs = packs.filter(p => !p.isPublic);
  }

  // Search by name
  if (options.search) {
    const query = options.search.toLowerCase();
    packs = packs.filter(p => {
      // Match pack name
      if (p.name.toLowerCase().includes(query)) return true;

      // Match image metadata
      return p.images.some(img => {
        if (img.metadata.description?.toLowerCase().includes(query)) return true;
        if (img.metadata.keywords?.some(k => k.includes(query))) return true;
        return false;
      });
    });
  }

  // Sort by creation date (newest first)
  packs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = packs.length;

  // Apply pagination
  if (options.offset) packs = packs.slice(options.offset);
  if (options.limit) packs = packs.slice(0, options.limit);

  return { packs, total };
}

/**
 * Get a single pack with all images
 */
export async function getPack(
  packId: string,
  config: PackConfig = {},
): Promise<Pack | null> {
  const packsDir = config.packsDir || './var/packs';
  const packs = await loadPacks(packsDir);
  return packs.get(packId) || null;
}

/**
 * Update pack metadata
 */
export async function updatePack(
  packId: string,
  updates: {
    name?: string;
    description?: string;
    isPublic?: boolean;
  },
  config: PackConfig = {},
): Promise<Pack | null> {
  const packsDir = config.packsDir || './var/packs';
  const packs = await loadPacks(packsDir);
  const pack = packs.get(packId);

  if (!pack) return null;

  if (updates.name) pack.name = updates.name;
  if (updates.description !== undefined) pack.description = updates.description;
  if (updates.isPublic !== undefined) pack.isPublic = updates.isPublic;
  pack.updatedAt = new Date().toISOString();

  await savePack(pack, packsDir);
  return pack;
}

/**
 * Delete a pack
 */
export async function deletePack(
  packId: string,
  config: PackConfig = {},
): Promise<boolean> {
  const packsDir = config.packsDir || './var/packs';
  const packs = await loadPacks(packsDir);
  const pack = packs.get(packId);

  if (!pack) return false;

  packs.delete(packId);
  await fs.unlink(join(packsDir, `${packId}.json`));
  return true;
}

/**
 * Add image to pack
 */
export async function addPackImage(
  packId: string,
  imageUrl: string,
  options: {
    filename?: string;
    metadata?: Partial<ImageMetadata>;
  } = {},
  config: PackConfig = {},
): Promise<PackImage | null> {
  const packsDir = config.packsDir || './var/packs';
  const packs = await loadPacks(packsDir);
  const pack = packs.get(packId);

  if (!pack) return null;

  const image: PackImage = {
    id: randomUUID(),
    url: imageUrl,
    filename: options.filename || imageUrl.split('/').pop() || randomUUID(),
    metadata: {
      status: 'pending',
      description: options.metadata?.description || '',
      keywords: options.metadata?.keywords || [],
      ...options.metadata,
    },
    createdAt: new Date().toISOString(),
  };

  pack.images.push(image);
  pack.updatedAt = new Date().toISOString();

  await savePack(pack, packsDir);

  // TODO: Trigger async metadata generation if enabled
  // if (config.generateMetadata) {
  //   generateImageMetadata(imageUrl, geminiClient).then(metadata => {
  //     image.metadata = metadata;
  //     savePack(pack, packsDir);
  //   });
  // }

  return image;
}

/**
 * Delete image from pack
 */
export async function deletePackImage(
  packId: string,
  imageId: string,
  config: PackConfig = {},
): Promise<boolean> {
  const packsDir = config.packsDir || './var/packs';
  const packs = await loadPacks(packsDir);
  const pack = packs.get(packId);

  if (!pack) return false;

  const index = pack.images.findIndex(img => img.id === imageId);
  if (index === -1) return false;

  pack.images.splice(index, 1);
  pack.updatedAt = new Date().toISOString();

  await savePack(pack, packsDir);
  return true;
}

/**
 * Get image metadata
 */
export async function getPackImage(
  packId: string,
  imageId: string,
  config: PackConfig = {},
): Promise<PackImage | null> {
  const pack = await getPack(packId, config);
  if (!pack) return null;
  return pack.images.find(img => img.id === imageId) || null;
}

/**
 * Update image metadata
 */
export async function updatePackImageMetadata(
  packId: string,
  imageId: string,
  metadata: Partial<ImageMetadata>,
  config: PackConfig = {},
): Promise<PackImage | null> {
  const packsDir = config.packsDir || './var/packs';
  const packs = await loadPacks(packsDir);
  const pack = packs.get(packId);

  if (!pack) return null;

  const image = pack.images.find(img => img.id === imageId);
  if (!image) return null;

  image.metadata = { ...image.metadata, ...metadata };
  pack.updatedAt = new Date().toISOString();

  await savePack(pack, packsDir);
  return image;
}

/**
 * OpenClaw tool definitions
 */
export const createPackTool = {
  name: 'create_pack',
  description: 'Create a new image pack for slideshow backgrounds',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Pack name',
      },
      description: {
        type: 'string',
        description: 'Pack description (optional)',
      },
      is_public: {
        type: 'boolean',
        description: 'Make pack publicly visible (default: false)',
      },
    },
    required: ['name'],
  },
};

export const listPacksTool = {
  name: 'list_packs',
  description: 'List image packs with optional search. Search matches pack names AND image metadata (descriptions + keywords).',
  parameters: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Search query to filter packs',
      },
      include_public: {
        type: 'boolean',
        description: 'Include public packs (default: true)',
      },
      limit: {
        type: 'number',
        description: 'Max number of packs to return (default: 20)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default: 0)',
      },
    },
  },
};

export const getPackTool = {
  name: 'get_pack',
  description: 'Get a single pack with full image list and AI-generated metadata for each image',
  parameters: {
    type: 'object',
    properties: {
      pack_id: {
        type: 'string',
        description: 'Pack ID',
      },
    },
    required: ['pack_id'],
  },
};

export const updatePackTool = {
  name: 'update_pack',
  description: 'Update pack metadata (name, description, visibility)',
  parameters: {
    type: 'object',
    properties: {
      pack_id: {
        type: 'string',
        description: 'Pack ID',
      },
      name: {
        type: 'string',
        description: 'New pack name',
      },
      description: {
        type: 'string',
        description: 'New description',
      },
      is_public: {
        type: 'boolean',
        description: 'Change visibility',
      },
    },
    required: ['pack_id'],
  },
};

export const deletePackTool = {
  name: 'delete_pack',
  description: 'Delete a pack and all its images',
  parameters: {
    type: 'object',
    properties: {
      pack_id: {
        type: 'string',
        description: 'Pack ID to delete',
      },
    },
    required: ['pack_id'],
  },
};

export const addPackImageTool = {
  name: 'add_pack_image',
  description: 'Add an image URL to a pack. Optionally provide metadata, otherwise it will be generated.',
  parameters: {
    type: 'object',
    properties: {
      pack_id: {
        type: 'string',
        description: 'Pack ID',
      },
      image_url: {
        type: 'string',
        description: 'URL of the image to add',
      },
      filename: {
        type: 'string',
        description: 'Custom filename (optional)',
      },
      description: {
        type: 'string',
        description: 'Image description (optional, auto-generated if omitted)',
      },
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Search keywords (optional, auto-generated if omitted)',
      },
    },
    required: ['pack_id', 'image_url'],
  },
};

export const deletePackImageTool = {
  name: 'delete_pack_image',
  description: 'Remove an image from a pack',
  parameters: {
    type: 'object',
    properties: {
      pack_id: {
        type: 'string',
        description: 'Pack ID',
      },
      image_id: {
        type: 'string',
        description: 'Image ID to remove',
      },
    },
    required: ['pack_id', 'image_id'],
  },
};

/**
 * Create tool instances with config
 */
function toPackConfig(config: any): PackConfig {
  return {
    packsDir: config.packsDir,
    generateMetadata: config.generateMetadata,
  };
}

export function createCreatePackTool(config: any = {}) {
  const packConfig = toPackConfig(config);
  return {
    ...createPackTool,
    execute: async (params: any) => createPack(params.name, params, packConfig),
  };
}

export function createListPacksTool(config: any = {}) {
  const packConfig = toPackConfig(config);
  return {
    ...listPacksTool,
    execute: async (params: any) => listPacks(params, packConfig),
  };
}

export function createGetPackTool(config: any = {}) {
  const packConfig = toPackConfig(config);
  return {
    ...getPackTool,
    execute: async (params: any) => getPack(params.pack_id, packConfig),
  };
}

export function createUpdatePackTool(config: any = {}) {
  const packConfig = toPackConfig(config);
  return {
    ...updatePackTool,
    execute: async (params: any) => updatePack(params.pack_id, params, packConfig),
  };
}

export function createDeletePackTool(config: any = {}) {
  const packConfig = toPackConfig(config);
  return {
    ...deletePackTool,
    execute: async (params: any) => {
      const deleted = await deletePack(params.pack_id, packConfig);
      return { deleted, packId: params.pack_id };
    },
  };
}

export function createAddPackImageTool(config: any = {}) {
  const packConfig = toPackConfig(config);
  return {
    ...addPackImageTool,
    execute: async (params: any) => {
      const metadata = {
        description: params.description,
        keywords: params.keywords,
      };
      return addPackImage(params.pack_id, params.image_url, {
        filename: params.filename,
        metadata,
      }, packConfig);
    },
  };
}

export function createDeletePackImageTool(config: any = {}) {
  const packConfig = toPackConfig(config);
  return {
    ...deletePackImageTool,
    execute: async (params: any) => {
      const deleted = await deletePackImage(params.pack_id, params.image_id, packConfig);
      return { deleted, packId: params.pack_id, imageId: params.image_id };
    },
  };
}
