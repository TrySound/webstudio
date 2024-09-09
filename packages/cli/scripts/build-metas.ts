import { mkdir, writeFile } from "node:fs/promises";
import * as baseComponentMetas from "@webstudio-is/sdk-components-react/metas";
import * as radixComponentMetas from "@webstudio-is/sdk-components-react-radix/metas";
import * as remixComponentMetas from "@webstudio-is/sdk-components-react-remix/metas";

const formatModule = (data: Record<string, unknown>) => {
  let code = "";
  for (const [exportName, exportValue] of Object.entries(data)) {
    code += `export const ${exportName} = ${JSON.stringify(exportValue)};\n`;
  }
  return code;
};

await mkdir("./lib");
await writeFile(
  "./lib/sdk-components-react-metas.js",
  formatModule(baseComponentMetas)
);
await writeFile(
  "./lib/sdk-components-react-radix-metas.js",
  formatModule(radixComponentMetas)
);
await writeFile(
  "./lib/sdk-components-react-remix-metas.js",
  formatModule(remixComponentMetas)
);
