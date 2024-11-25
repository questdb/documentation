module.exports = () => ({
  name: "manifest",
  configureWebpack: (config, isServer, { currentBundler }) => {
    const { WebpackManifestPlugin } = currentBundler.instance.require("webpack-manifest-plugin")
    return {
      plugins: isServer
        ? []
        : [new WebpackManifestPlugin({ fileName: "asset-manifest.json" })],
    }
  },
})
