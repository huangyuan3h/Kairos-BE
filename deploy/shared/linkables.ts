/**
 * Shared linkable resources that can be used across different services
 * These resources provide configuration values that can be linked to functions
 */
export function createLinkables() {
  const linkableValue = new sst.Linkable("MyLinkableValue", {
    properties: {
      foo: "Hello World",
    },
  });

  return {
    linkableValue,
  };
}
