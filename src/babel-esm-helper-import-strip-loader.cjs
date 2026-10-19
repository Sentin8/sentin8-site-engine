// Engine loader (post-pipeline): neutralize the ESM runtime-helper imports that
// @docusaurus/babel injects into docusaurus-theme-openapi-docs `lib/theme` CJS
// files on the client build. Babel (preset-env, useESModules runtime helpers)
// rewrites TS helper guards into `import _x from "@babel/runtime/helpers/esm/…"`
// - a real ESM import token inside an otherwise-CJS module. Webpack then
// classifies the whole module as ESM (emitting __webpack_require__.r) while the
// TS-CJS body (`exports.default = …`) stays verbatim, so the module throws
// `ReferenceError: exports is not defined` in the browser
// (sentin8-site-engine design §5, webpack interop defect).
//
// This loader rewrites ONLY the `@babel/runtime/helpers/esm/…` default-import
// statements into their CommonJS counterparts (`require("@babel/runtime/helpers/…")`
// plus a default-interop shim), making the module pure CJS again. Every helper
// module ships both ESM and CJS builds, so semantics are unchanged. The import
// specifier may be a package-relative path or an absolute resolved path - both
// end in `/@babel/runtime/helpers/esm/<helper>(.js)?` and both map 1:1 to the
// CJS build at `/@babel/runtime/helpers/<helper>` (or `<helper>/index.js`).
module.exports = function babelEsmHelperImportStripLoader(source) {
  if (!source.includes('@babel/runtime/helpers/esm/')) return source;
  return source.replace(
    /import\s+(\w+)\s+from\s*["']([^"']*@babel\/runtime\/helpers\/esm\/([\w.$-]+?))(?:\.js)?["'];?/g,
    (match, binding, fullSpec, helper) => {
      const cjsSpec = fullSpec.replace('/@babel/runtime/helpers/esm/', '/@babel/runtime/helpers/');
      return (
        `var ${binding} = require(${JSON.stringify(cjsSpec)});` +
        ` ${binding} = ${binding} && ${binding}.__esModule ? ${binding}.default : ${binding};`
      );
    },
  );
};