import { createConfigValidatorTool } from '../tools/config-validator.js';

const tool = createConfigValidatorTool();
const result = await tool.execute();
console.log(result.content[0].text);
