import { bundle } from "@remotion/bundler";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
await bundle({
  entryPoint: path.join(dir, "composition.tsx"),
  outDir: path.join(dir, "bundle"),
  webpackOverride: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        react: path.join(dir, "node_modules/react"),
        "react-dom": path.join(dir, "node_modules/react-dom"),
        remotion: path.join(dir, "node_modules/remotion"),
        "@remotion/media": path.join(dir, "node_modules/@remotion/media"),
        "@fontsource/noto-sans-myanmar": path.join(
          dir,
          "node_modules/@fontsource/noto-sans-myanmar",
        ),
      },
    },
  }),
});
