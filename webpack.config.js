var path = require("path");
var fs = require("fs");
var webpack = require('webpack');
var CleanWebpackPlugin = require('clean-webpack-plugin');

var lambdaContainerFolder = path.join(__dirname, "./lambda");

module.exports = {
    entry: fs.readdirSync(lambdaContainerFolder)
        .filter(item => fs.statSync(path.join(lambdaContainerFolder, item)).isDirectory())
        .map(lambdaFolder => {
            var entry = {};
            entry[lambdaFolder] = path.join(lambdaContainerFolder, lambdaFolder, 'index.js');
            return entry;
        })
        .reduce((finalObject, entry) => Object.assign(finalObject, entry), {}),
    output: {
        path: path.join(__dirname, "dist"),
        library: "[name]",
        libraryTarget: "commonjs2",
        filename: "[name].js"
    },
    target: "node",
    module: {
        loaders: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                loader: 'babel',
                query: JSON.parse(
                    fs.readFileSync(path.join(__dirname, ".babelrc"), {encoding: "utf8"})
                )
            },
            {
                test: /\.json$/,
                loader: 'json'
            }
        ]
    },
    plugins: [
        new CleanWebpackPlugin(['dist', 'build'], __dirname),
        new webpack.optimize.UglifyJsPlugin({
            //mangle: {
            //    except: ['exports', 'require']
            //}
        })
    ]
};
