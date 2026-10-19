// Engine loader: neutralize the TypeScript `var __x = (this && this.__x) || ...`
// runtime-helper guards shipped in docusaurus-theme-openapi-docs `lib/theme` CJS
// files. Webpack's CommonJsExportsParserPlugin bails out of export tracking ("this
// is used directly"), which leaves `providedExports = ['__esModule']` and makes
// webpack emit `__webpack_require__.r()` on these modules while keeping their
// `exports.default = ...` bodies verbatim — those bodies then throw
// `ReferenceError: exports is not defined` in the browser (sentin8-site-engine
// design §5, webpack interop defect).
//
// The loader strips ONLY the `this && this.__helper` prefixes of the known TS
// helper assignments (the `|| function ...` fallback is what actually runs), so
// module semantics are unchanged and webpack can track exports normally.
module.exports = function guardStripLoader(source) {
  return source.replace(
    /=\s*\(\s*this\s*&&\s*this\.(__createBinding|__importStar|__importDefault|__importDefault|__extends|__rest|__spreadArray|__spreadValues|__awaiter|__generator|__exportStar|__values|__read|__await|__asyncDelegator|__asyncValues|__makeTemplateObject|__decorate|__param|__metadata|__addDisposableResource|__disposeResources)\s*\)\s*\|\|/g,
    '=',
  );
};