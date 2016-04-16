/**
 * Import dependencies.
 */
var fs = require('fs');
var path = require('path');
var AWS = require('aws-sdk');
var JSZip = require('jszip');
var config = require('../lambda/config.json');

console.log('start deploy all.');

/**
 * Set the default AWS region.
 */
AWS.config.region = config.REGION;

/**
 * Lambda access.
 */
var lambda = new AWS.Lambda();

/**
 * IAM access.
 */
var iam = new AWS.IAM();

/**
 * Get all deployed and local lambda functions and roles.
 */
var deployedLambdaFunctions = [];
var deployedRoles = [];

lambda.listFunctions().promise()
    .then(function (response) {
        console.log('listFunctions:', response);
        deployedLambdaFunctions = response.Functions;
        return iam.listRoles().promise();
    })
    .catch(function (err) {
        console.log(err);
    })
    .then(function (response) {
        console.log('roles:', response);
        deployedRoles = response.Roles;
    })
    .then(function () {
        var lambdaContainerFolder = path.join(__dirname, '../lambda/');

        console.log(lambdaContainerFolder);

        var lambdaFunctionNames = fs.readdirSync(lambdaContainerFolder)
            .filter(function (item) {
                console.log(item);
                return fs.statSync(path.join(lambdaContainerFolder, item)).isDirectory();
            });

        console.log(lambdaFunctionNames);

        /**
         * Process each local lambda function.
         */
        var i = 0;

        function next() {
            if (i < lambdaFunctionNames.length) {
                var lambdaFunctionName = lambdaFunctionNames[i];
                var roleName = 'Lambda-' + lambdaFunctionName;
                console.log('Starting [' + lambdaFunctionName + ']');
                deploy(lambdaFunctionName, roleName).then(function () {
                    i++;
                    next();
                })
            }
        }

        next();
    });

/**
 * Deploy the given lambda function and role.
 */
function deploy(lambdaFunctionName, roleName) {
    /**
     * Read the policy documents for the lambda function's role.
     */
    try {
        var assumeRolePolicyDocument = fs.readFileSync(path.join(__dirname, '../lambda/', 'trust_policy_lambda.json')).toString();
        var rolePolicyDocument = fs.readFileSync(path.join(__dirname, '../lambda/', lambdaFunctionName, 'policy.json')).toString();
    } catch (err) {
        console.log('Skipped because there is no [policy.json]');
        return Promise.resolve();
    }

    /**
     * Read the setup JSON for the lambda function.
     */
    try {
        var lambdaSetup = JSON.parse(fs.readFileSync(path.join(__dirname, '../lambda/', lambdaFunctionName, 'setup.json')).toString());
    } catch (err) {
        console.log('Skipped because there is no [setup.json]');
        return Promise.resolve();
    }

    /**
     * Read the lambda function's source code.
     */
    try {
        var lambdaSource = fs.readFileSync(path.join(__dirname, '../dist/', lambdaFunctionName + '.js'));
    } catch (err) {
        console.log('Failed to zip the source code', err);
        return Promise.resolve();
    }

    /**
     * Zip the source code.
     */
    var zip = new JSZip();
    zip.file("index.js", lambdaSource);
    return zip.generateAsync({type: 'nodebuffer'})
        .then(function (lambdaFunctionZip) {

            /**
             * Create or update the role and its policies.
             */
            var role = deployedRoles.find(function (r) {
                    return r.RoleName === roleName;
                }) || null;

            if (role === null) {
                return iam.createRole({
                    AssumeRolePolicyDocument: assumeRolePolicyDocument, /* required */
                    RoleName: roleName /* required */
                }).promise()
                    .then(function (response) {
                        role = response.Role;
                    })
                    .catch(function (err) {
                        console.log(err, err.stack);
                    })
                    .then(function () {
                        if (role === null) {
                            return null;
                        }
                        return iam.putRolePolicy({
                            PolicyDocument: rolePolicyDocument, /* required */
                            PolicyName: lambdaFunctionName, /* required */
                            RoleName: role.RoleName /* required */
                        }).promise();
                    })
                    .catch(function (err) {
                        console.log(err, err.stack);
                        return Promise.resolve();
                    })
                    .then(function () {
                        return createLambda();
                    });
            } else {
                return iam.updateAssumeRolePolicy({
                    PolicyDocument: assumeRolePolicyDocument, /* required */
                    RoleName: roleName /* required */
                }).promise()
                    .catch(function (err) {
                        console.log(err, err.stack);
                    })
                    .then(function () {
                        if (role === null) {
                            return null;
                        }
                        return iam.putRolePolicy({
                            PolicyDocument: rolePolicyDocument, /* required */
                            PolicyName: lambdaFunctionName, /* required */
                            RoleName: role.RoleName /* required */
                        }).promise();
                    })
                    .catch(function (err) {
                        console.log(err, err.stack);
                        return Promise.resolve();
                    })
                    .then(function () {
                        return createLambda();
                    });
            }

            /**
             * Create or update the lambda function.
             */
            function createLambda() {
                var lambdaFunction = deployedLambdaFunctions.find(function (f) {
                        return f.FunctionName === lambdaFunctionName;
                    }) || null;

                if (lambdaFunction === null) {
                    return lambda.createFunction(Object.assign({
                        Code: {
                            /* required */
                            ZipFile: lambdaFunctionZip
                        },
                        FunctionName: lambdaFunctionName, /* required */
                        Role: role.Arn, /* required */
                        Runtime: 'nodejs4.3' /* required */
                    }, lambdaSetup)).promise()
                        .then(function (response) {
                            console.log('Successfully created lambda [' + lambdaFunctionName + ']', response);
                            return Promise.resolve();
                        })
                        .catch(function (err) {
                            console.log('Failed to create lambda [' + lambdaFunctionName + ']', err, err.stack);
                            return Promise.resolve();
                        });
                } else {
                    return lambda.updateFunctionCode({
                        FunctionName: lambdaFunctionName, /* required */
                        Publish: true,
                        ZipFile: lambdaFunctionZip
                    }).promise()
                        .then(function (response) {
                            console.log('Successfully updated lambda [' + lambdaFunctionName + ']', response);
                            return Promise.resolve();
                        })
                        .catch(function (err) {
                            console.log('Failed to update lambda [' + lambdaFunctionName + ']', err, err.stack);
                            return Promise.resolve();
                        });
                }
            }
        })
        .catch(function (err) {
            console.log(err, err.stack);
            return Promise.resolve();
        });
}