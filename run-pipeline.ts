#!/usr/bin/env bun
import { PipelineController } from './src/pipeline/PipelineController.js';

const controller = new PipelineController();
const result = await controller.run({
  date: '2026-03-24',
  platform: 'all',
  postCount: 1,
  autoPublish: false // dry-run mode
});

console.log(JSON.stringify(result, null, 2));
