module.exports = () => ({
  name: "optimize",
  configureWebpack: (config, isServer, { currentBundler }) => {
    return {
      optimization: {
        runtimeChunk: false,
        splitChunks: isServer
          ? false
          : {
              cacheGroups: {
                common: {
                  name: "common",
                  minChunks: 2,
                  priority: -30,
                  reuseExistingChunk: true,
                },
                vendors: false,
              },
            },
      },
    }
  },
})
