const path = require("path");
const webpack = require("webpack");

const isProd = process.env.ENV === "production";

module.exports = {
    entry: {
        "covisual": "./src/Index.ts",
    },
    devtool: "cheap-module-source-map",
    optimization: {
        // We no not want to minimize our code for dev.
        minimize: isProd
    },
    mode: isProd ? "production" : "development",
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: "ts-loader",
            },
            {
                test: /\.ts$/,
                enforce: "pre",
                use: [
                    {
                        loader: "tslint-loader",
                        options: { /* Loader options go here */ },
                    },
                ],
            },
        ],
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js"],
    },
    output: {
        filename: "covisual.js",
        path: path.resolve(__dirname, "public"),
    },
    devServer: {
        contentBase: path.join(__dirname, "public"),
        compress: true,
        port: 9000,
        hot: true,
    },
    performance: {
        hints: false,
    },
    plugins: [
        new webpack.DefinePlugin({
            __VERSION__: `"${require("./package.json").version}"`,
        }),
    ],
};
