export function markdownTextPlugin() {
  return {
    name: "markdown-text",
    transform(code: string, id: string) {
      if (!id.endsWith(".md")) {
        return undefined;
      }
      return {
        code: `export default ${JSON.stringify(code)};`,
        map: null,
      };
    },
  };
}
