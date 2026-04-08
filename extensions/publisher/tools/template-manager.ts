/**
 * Template Management Tools - Reusable Slideshow Structures
 *
 * Templates are reusable slideshow configurations that can be created
 * from scratch or converted from successful slideshows.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export type TemplateConfig = {
  version: number;
  structure: {
    slides: Array<{
      duration?: number;
      transition?: string;
      layout?: string;
    }>;
  };
  content: Record<string, unknown>;
  visuals: Record<string, unknown>;
};

export type TemplateVisibility = 'private' | 'workspace' | 'public';

export type TemplateConfigInput = Partial<TemplateConfig>;

export type Template = {
  id: string;
  name: string;
  description?: string;
  visibility: TemplateVisibility;
  config: TemplateConfig;
  sourceSlideshowId?: string;
  createdAt: string;
  updatedAt: string;
};

export type TemplateManagerConfig = {
  templatesDir?: string;
};

const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  version: 1,
  structure: {
    slides: [],
  },
  content: {},
  visuals: {},
};

/**
 * Load all templates from storage
 */
async function loadTemplates(templatesDir: string): Promise<Map<string, Template>> {
  const templates = new Map<string, Template>();

  try {
    const files = await fs.readdir(templatesDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(join(templatesDir, file), 'utf-8');
        const template: Template = JSON.parse(content);
        templates.set(template.id, template);
      }
    }
  } catch (error) {
    // Directory doesn't exist yet
    await fs.mkdir(templatesDir, { recursive: true });
  }

  return templates;
}

/**
 * Save template to storage
 */
async function saveTemplate(template: Template, templatesDir: string): Promise<void> {
  await fs.mkdir(templatesDir, { recursive: true });
  await fs.writeFile(
    join(templatesDir, `${template.id}.json`),
    JSON.stringify(template, null, 2),
    'utf-8',
  );
}

/**
 * Validate template config structure
 */
function validateTemplateConfig(config: unknown): TemplateConfig {
  if (typeof config !== 'object' || config === null) {
    throw new Error('Template config must be an object');
  }

  const cfg = config as Record<string, unknown>;

  // Ensure version exists
  if (typeof cfg.version !== 'number') {
    cfg.version = 1;
  }

  // Ensure structure exists
  if (typeof cfg.structure !== 'object' || cfg.structure === null) {
    cfg.structure = { slides: [] };
  } else {
    const structure = cfg.structure as Record<string, unknown>;
    if (!Array.isArray(structure.slides)) {
      structure.slides = [];
    }
  }

  // Ensure content and visuals exist
  if (typeof cfg.content !== 'object' || cfg.content === null) {
    cfg.content = {};
  }
  if (typeof cfg.visuals !== 'object' || cfg.visuals === null) {
    cfg.visuals = {};
  }

  return cfg as TemplateConfig;
}

/**
 * Create a new template
 */
export async function createTemplate(
  name: string,
  options: {
    description?: string;
    visibility?: TemplateVisibility;
    config?: TemplateConfigInput;
    configJson?: string;
  } = {},
  managerConfig: TemplateManagerConfig = {},
): Promise<Template> {
  const templatesDir = managerConfig.templatesDir || './var/templates';

  // Parse config from JSON string or use provided config
  let templateConfig: TemplateConfig;
  if (options.configJson) {
    try {
      const parsed = JSON.parse(options.configJson);
      templateConfig = validateTemplateConfig(parsed);
    } catch (e) {
      throw new Error(`Invalid config JSON: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  } else if (options.config) {
    templateConfig = validateTemplateConfig(options.config);
  } else {
    templateConfig = { ...DEFAULT_TEMPLATE_CONFIG };
  }

  const template: Template = {
    id: randomUUID(),
    name,
    description: options.description,
    visibility: options.visibility || 'private',
    config: templateConfig,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveTemplate(template, templatesDir);
  return template;
}

/**
 * List templates with optional search and filtering
 */
export async function listTemplates(
  options: {
    search?: string;
    visibility?: TemplateVisibility;
    limit?: number;
    offset?: number;
  } = {},
  managerConfig: TemplateManagerConfig = {},
): Promise<{ templates: Template[]; total: number }> {
  const templatesDir = managerConfig.templatesDir || './var/templates';
  const templatesMap = await loadTemplates(templatesDir);
  let templates = Array.from(templatesMap.values());

  // Filter by visibility
  if (options.visibility) {
    templates = templates.filter(t => t.visibility === options.visibility);
  }

  // Search by name or description
  if (options.search) {
    const query = options.search.toLowerCase();
    templates = templates.filter(t => {
      if (t.name.toLowerCase().includes(query)) return true;
      if (t.description?.toLowerCase().includes(query)) return true;
      return false;
    });
  }

  // Sort by creation date (newest first)
  templates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = templates.length;

  // Apply pagination
  if (options.offset) templates = templates.slice(options.offset);
  if (options.limit) templates = templates.slice(0, options.limit);

  return { templates, total };
}

/**
 * Get a single template by ID
 */
export async function getTemplate(
  templateId: string,
  managerConfig: TemplateManagerConfig = {},
): Promise<Template | null> {
  const templatesDir = managerConfig.templatesDir || './var/templates';
  const templates = await loadTemplates(templatesDir);
  return templates.get(templateId) || null;
}

/**
 * Update template metadata or config
 */
export async function updateTemplate(
  templateId: string,
  updates: {
    name?: string;
    description?: string;
    visibility?: TemplateVisibility;
    config?: TemplateConfigInput;
    configJson?: string;
    clearDescription?: boolean;
  },
  managerConfig: TemplateManagerConfig = {},
): Promise<Template | null> {
  const templatesDir = managerConfig.templatesDir || './var/templates';
  const templates = await loadTemplates(templatesDir);
  const template = templates.get(templateId);

  if (!template) return null;

  if (updates.name) template.name = updates.name;

  if (updates.clearDescription) {
    template.description = undefined;
  } else if (updates.description !== undefined) {
    template.description = updates.description;
  }

  if (updates.visibility) template.visibility = updates.visibility;

  // Handle config updates
  if (updates.configJson) {
    try {
      const parsed = JSON.parse(updates.configJson);
      template.config = validateTemplateConfig(parsed);
    } catch (e) {
      throw new Error(`Invalid config JSON: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  } else if (updates.config) {
    template.config = validateTemplateConfig({
      ...template.config,
      ...updates.config,
    });
  }

  template.updatedAt = new Date().toISOString();

  await saveTemplate(template, templatesDir);
  return template;
}

/**
 * Delete a template
 */
export async function deleteTemplate(
  templateId: string,
  managerConfig: TemplateManagerConfig = {},
): Promise<boolean> {
  const templatesDir = managerConfig.templatesDir || './var/templates';
  const templates = await loadTemplates(templatesDir);
  const template = templates.get(templateId);

  if (!template) return false;

  templates.delete(templateId);
  await fs.unlink(join(templatesDir, `${templateId}.json`));
  return true;
}

/**
 * Create a template from an existing slideshow
 * Converts a successful slideshow into a reusable template structure
 */
export async function createTemplateFromSlideshow(
  slideshowId: string,
  name: string,
  options: {
    description?: string;
    visibility?: TemplateVisibility;
    preserveText?: boolean;
  } = {},
  managerConfig: TemplateManagerConfig = {},
): Promise<Template> {
  const templatesDir = managerConfig.templatesDir || './var/templates';

  // TODO: In a real implementation, this would fetch the slideshow data
  // from an API or database. For now, we create a placeholder config.
  const slideshowConfig: TemplateConfig = {
    version: 1,
    structure: {
      slides: [
        { duration: 3, transition: 'fade', layout: 'full' },
        { duration: 3, transition: 'slide', layout: 'full' },
        { duration: 3, transition: 'fade', layout: 'full' },
      ],
    },
    content: options.preserveText
      ? { preservedFromSlideshow: slideshowId }
      : {},
    visuals: {},
  };

  const template: Template = {
    id: randomUUID(),
    name,
    description: options.description || `Template created from slideshow ${slideshowId}`,
    visibility: options.visibility || 'private',
    config: slideshowConfig,
    sourceSlideshowId: slideshowId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveTemplate(template, templatesDir);
  return template;
}

// ============================================================================
// OpenClaw Tool Definitions
// ============================================================================

export const createTemplateTool = {
  name: 'create_template',
  description: 'Create a reusable slideshow template with structure, content, and visual configuration',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Template name',
      },
      description: {
        type: 'string',
        description: 'Template description (optional)',
      },
      visibility: {
        type: 'string',
        enum: ['private', 'workspace', 'public'],
        description: 'Template visibility (default: private)',
      },
      config_json: {
        type: 'string',
        description: 'JSON string with template config (version, structure, content, visuals)',
      },
    },
    required: ['name'],
  },
};

export const listTemplatesTool = {
  name: 'list_templates',
  description: 'Search and filter slideshow templates by name, description, or visibility',
  parameters: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Search query to filter templates by name/description',
      },
      visibility: {
        type: 'string',
        enum: ['private', 'workspace', 'public'],
        description: 'Filter by visibility level',
      },
      limit: {
        type: 'number',
        description: 'Max number of templates to return (default: 20)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default: 0)',
      },
    },
  },
};

export const getTemplateTool = {
  name: 'get_template',
  description: 'Get full template configuration including structure, content, and visuals',
  parameters: {
    type: 'object',
    properties: {
      template_id: {
        type: 'string',
        description: 'Template ID',
      },
    },
    required: ['template_id'],
  },
};

export const updateTemplateTool = {
  name: 'update_template',
  description: 'Update template metadata or configuration',
  parameters: {
    type: 'object',
    properties: {
      template_id: {
        type: 'string',
        description: 'Template ID to update',
      },
      name: {
        type: 'string',
        description: 'New template name',
      },
      description: {
        type: 'string',
        description: 'New description',
      },
      visibility: {
        type: 'string',
        enum: ['private', 'workspace', 'public'],
        description: 'Change visibility level',
      },
      config_json: {
        type: 'string',
        description: 'New template config as JSON string',
      },
      clear_description: {
        type: 'boolean',
        description: 'Set to true to remove the description',
      },
    },
    required: ['template_id'],
  },
};

export const deleteTemplateTool = {
  name: 'delete_template',
  description: 'Delete a template permanently',
  parameters: {
    type: 'object',
    properties: {
      template_id: {
        type: 'string',
        description: 'Template ID to delete',
      },
    },
    required: ['template_id'],
  },
};

export const createTemplateFromSlideshowTool = {
  name: 'create_template_from_slideshow',
  description: 'Convert a successful slideshow into a reusable template structure',
  parameters: {
    type: 'object',
    properties: {
      slideshow_id: {
        type: 'string',
        description: 'Source slideshow ID to convert',
      },
      name: {
        type: 'string',
        description: 'Name for the new template',
      },
      description: {
        type: 'string',
        description: 'Template description (optional)',
      },
      visibility: {
        type: 'string',
        enum: ['private', 'workspace', 'public'],
        description: 'Template visibility (default: private)',
      },
      preserve_text: {
        type: 'boolean',
        description: 'Preserve text content from source slideshow (default: false)',
      },
    },
    required: ['slideshow_id', 'name'],
  },
};

// ============================================================================
// Tool Factory Functions
// ============================================================================

function toTemplateManagerConfig(config: any): TemplateManagerConfig {
  return {
    templatesDir: config.templatesDir,
  };
}

export function createCreateTemplateTool(config: any = {}) {
  const managerConfig = toTemplateManagerConfig(config);
  return {
    ...createTemplateTool,
    execute: async (params: any) =>
      createTemplate(params.name, {
        description: params.description,
        visibility: params.visibility,
        configJson: params.config_json,
      }, managerConfig),
  };
}

export function createListTemplatesTool(config: any = {}) {
  const managerConfig = toTemplateManagerConfig(config);
  return {
    ...listTemplatesTool,
    execute: async (params: any) =>
      listTemplates({
        search: params.search,
        visibility: params.visibility,
        limit: params.limit,
        offset: params.offset,
      }, managerConfig),
  };
}

export function createGetTemplateTool(config: any = {}) {
  const managerConfig = toTemplateManagerConfig(config);
  return {
    ...getTemplateTool,
    execute: async (params: any) =>
      getTemplate(params.template_id, managerConfig),
  };
}

export function createUpdateTemplateTool(config: any = {}) {
  const managerConfig = toTemplateManagerConfig(config);
  return {
    ...updateTemplateTool,
    execute: async (params: any) =>
      updateTemplate(params.template_id, {
        name: params.name,
        description: params.description,
        visibility: params.visibility,
        configJson: params.config_json,
        clearDescription: params.clear_description,
      }, managerConfig),
  };
}

export function createDeleteTemplateTool(config: any = {}) {
  const managerConfig = toTemplateManagerConfig(config);
  return {
    ...deleteTemplateTool,
    execute: async (params: any) => {
      const deleted = await deleteTemplate(params.template_id, managerConfig);
      return { deleted, templateId: params.template_id };
    },
  };
}

export function createCreateTemplateFromSlideshowTool(config: any = {}) {
  const managerConfig = toTemplateManagerConfig(config);
  return {
    ...createTemplateFromSlideshowTool,
    execute: async (params: any) =>
      createTemplateFromSlideshow(params.slideshow_id, params.name, {
        description: params.description,
        visibility: params.visibility,
        preserveText: params.preserve_text,
      }, managerConfig),
  };
}
