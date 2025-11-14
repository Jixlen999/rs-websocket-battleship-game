import path from 'path';
import nodeExternals from 'webpack-node-externals';

export default {
  entry: './src/index.ts',
  target: 'node',
  externals: [nodeExternals()],
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: 'index.js',
    path: path.resolve(import.meta.dirname, 'dist'),
  },
};
