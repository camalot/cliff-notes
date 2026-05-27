export { detectProfiles, type ProfileId } from "./profile-detect.js";
export {
  cursorContext,
  type Binding,
  type CompletionIntent,
  type CursorContext,
  type TypeRef,
} from "./scope.js";
export {
  buildRegistry,
  SchemaRegistry,
  type PropertyInfo,
  type TypeInfo,
} from "./schema-resolve.js";
export {
  teraFilters,
  teraFunctions,
  teraTags,
  teraTests,
  findFilter,
  findFunction,
  findTag,
  findTest,
  renderParamsMarkdown,
  type TeraFilter,
  type TeraFunction,
  type TeraParam,
  type TeraTag,
  type TeraTest,
} from "./builtins.js";
export {
  parseMacros,
  findMacro,
  type UserMacro,
} from "./macros.js";
export {
  completionsAt,
  completionsForContext,
  hoverAt,
  signatureHelpAt,
  type CompletionItem,
  type CompletionItemKind,
  type HoverInfo,
  type SignatureCallableKind,
  type SignatureHelpInfo,
  type SnippetDefinition,
} from "./api.js";
