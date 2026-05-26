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
  type TeraFilter,
  type TeraFunction,
  type TeraTag,
  type TeraTest,
} from "./builtins.js";
export {
  completionsAt,
  completionsForContext,
  hoverAt,
  type CompletionItem,
  type CompletionItemKind,
  type HoverInfo,
  type SnippetDefinition,
} from "./api.js";
