// @ts-check
'use strict';

const path = require('path');
const fs = require('fs');

class CopyAssetsPlugin {
  /**
   * @param {{ hooks: { afterEmit: { tap: (arg0: string, arg1: () => void) => void; }; }; }} compiler
   */
  apply(compiler) {
    compiler.hooks.afterEmit.tap('CopyAssetsPlugin', () => {
      const srcBase = path.resolve(__dirname, 'node_modules/@cliff-notes/tera-lang');
      const dstBase = path.resolve(__dirname, 'dist');
      for (const dir of ['grammars', 'snippets']) {
        fs.cpSync(path.join(srcBase, dir), path.join(dstBase, dir), { recursive: true });
      }
    });
  }
}

/** @type {import('webpack').Configuration} */
module.exports = {
  target: 'node',
  mode: 'none',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]',
  },
  externals: {
    vscode: 'commonjs vscode',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    conditionNames: ['import', 'require', 'node', 'default'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: 'ts-loader',
      },
    ],
  },
  experiments: {
    // needed to parse `import ... with { type: "json" }` in @cliff-notes/tera-lang dist
    importAttributes: true,
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: { level: 'log' },
  plugins: [new CopyAssetsPlugin()],
};
