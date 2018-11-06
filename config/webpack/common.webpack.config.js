/*jslint node: true */
'use strict';

const logger = require('@blackbaud/skyux-logger');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const SimpleProgressWebpackPlugin = require('simple-progress-webpack-plugin');
const LoaderOptionsPlugin = require('webpack/lib/LoaderOptionsPlugin');
const ContextReplacementPlugin = require('webpack/lib/ContextReplacementPlugin');
const { OutputKeepAlivePlugin } = require('../../plugin/output-keep-alive');
const skyPagesConfigUtil = require('../sky-pages/sky-pages.config');
const aliasBuilder = require('./alias-builder');

// This will fix a mapping bug for the latest version of rxjs-compat.
// See: https://github.com/ReactiveX/rxjs/issues/4070#issuecomment-429191227
const rxPaths = require('rxjs/_esm5/path-mapping')();
rxPaths['rxjs/internal/Observable'] = 'rxjs/_esm5/internal/Observable';

function spaPath() {
  return skyPagesConfigUtil.spaPath.apply(skyPagesConfigUtil, arguments);
}

function outPath() {
  return skyPagesConfigUtil.outPath.apply(skyPagesConfigUtil, arguments);
}

function getLogFormat(skyPagesConfig, argv) {
  if (argv.hasOwnProperty('logFormat')) {
    return argv.logFormat;
  }

  if (skyPagesConfig.runtime.command === 'serve' || argv.serve) {
    return 'compact';
  }

  return 'expanded';
}

/**
 * Called when loaded via require.
 * @name getWebpackConfig
 * @param {SkyPagesConfig} skyPagesConfig
 * @returns {WebpackConfig} webpackConfig
 */
function getWebpackConfig(skyPagesConfig, argv = {}) {
  const resolves = [
    process.cwd(),
    spaPath('node_modules'),
    outPath('node_modules')
  ];

  const alias = Object.assign({}, rxPaths, aliasBuilder.buildAliasList(skyPagesConfig));

  const outConfigMode = skyPagesConfig && skyPagesConfig.skyux && skyPagesConfig.skyux.mode;
  const logFormat = getLogFormat(skyPagesConfig, argv);

  let appPath;

  switch (outConfigMode) {
    case 'advanced':
      appPath = spaPath('src', 'main.ts');
      break;

    default:
      appPath = outPath('src', 'main-internal.ts');
      break;
  }

  const htmlWebpackPluginConfig = {
    template: skyPagesConfig.runtime.app.template,
    inject: skyPagesConfig.runtime.app.inject,
    runtime: skyPagesConfig.runtime,
    skyux: skyPagesConfig.skyux
  };

  let plugins = [
    // Some properties are required on the root object passed to HtmlWebpackPlugin
    new HtmlWebpackPlugin(htmlWebpackPluginConfig),

    new webpack.DefinePlugin({
      'skyPagesConfig': JSON.stringify(skyPagesConfig)
    }),

    new LoaderOptionsPlugin({
      options: {
        context: __dirname,
        skyPagesConfig: skyPagesConfig
      }
    }),

    new ContextReplacementPlugin(
      // The (\\|\/) piece accounts for path separators in *nix and Windows
      /angular(\\|\/)core(\\|\/)@angular/,
      spaPath('src'),
      {}
    ),

    // See: https://github.com/angular/angular/issues/20357#issuecomment-343683491
    new ContextReplacementPlugin(
      /\@angular(\\|\/)core(\\|\/)fesm5/,
      spaPath('src'),
      {}
    ),

    new OutputKeepAlivePlugin({
      enabled: argv['output-keep-alive']
    })
  ];

  // Supporting a custom logging type of none
  if (logFormat !== 'none') {
    plugins.push(new SimpleProgressWebpackPlugin({
      format: logFormat,
      color: logger.logColor
    }));
  }

  return {
    entry: {
      polyfills: [outPath('src', 'polyfills.ts')],
      vendor: [outPath('src', 'vendor.ts')],
      app: [appPath]
    },
    output: {
      filename: '[name].js',
      chunkFilename: '[id].chunk.js',
      path: spaPath('dist'),
    },
    resolveLoader: {
      modules: resolves
    },
    resolve: {
      alias: alias,
      modules: resolves,
      extensions: [
        '.js',
        '.ts'
      ]
    },
    module: {
      rules: [
        {
          enforce: 'pre',
          test: /config\.ts$/,
          loader: outPath('loader', 'sky-app-config'),
          include: outPath('runtime')
        },
        {
          enforce: 'pre',
          test: [
            /\.(html|s?css)$/,
            /sky-pages\.module\.ts/
          ],
          loader: outPath('loader', 'sky-assets')
        },
        {
          enforce: 'pre',
          test: /sky-pages\.module\.ts$/,
          loader: outPath('loader', 'sky-pages-module')
        },
        {
          enforce: 'pre',
          loader: outPath('loader', 'sky-processor', 'preload'),
          include: spaPath('src'),
          exclude: /node_modules/
        },
        {
          test: /\.s?css$/,
          use: [
            'raw-loader',
            'sass-loader'
          ]
        },
        {
          test: /\.html$/,
          loader: 'raw-loader'
        },
        {
          // Mark files inside `@angular/core` as using SystemJS style dynamic imports.
          // Removing this will cause deprecation warnings to appear.
          // See: https://github.com/angular/angular/issues/21560#issuecomment-433601967
          test: /[\/\\]@angular[\/\\]core[\/\\].+\.js$/,
          parser: {
            system: true
          }
        }
      ]
    },
    plugins
  };
}

module.exports = {
  getWebpackConfig: getWebpackConfig
};
