import { createConfigValidatorTool } from '../tools/config-validator.js';

async function main() {
  const tool = createConfigValidatorTool();
  const result = await tool.execute();
  console.log(result.content[0].text);
}

main().catch(console.error);
