/**
 * Import dependencies.
 */
var fs = require('fs');
var path = require('path');
var AWS = require('aws-sdk');
var JSZip = require('jszip');
var config = require('../lambda/config.json');

/**
 * Set the default AWS region.
 */
AWS.config.region = config.REGION;

/**
 * Get the lambda function name from the command line.
 */
var lambdaFunctionName = process.argv[2];
var roleName = 'Lambda-' + lambdaFunctionName;

/**
 * Read the policy documents for the lambda function's role.
 */
try {
    var assumeRolePolicyDocument = fs.readFileSync(path.join(__dirname, '../lambda/', 'trust_policy_lambda.json')).toString();
    var rolePolicyDocument = fs.readFileSync(path.join(__dirname, '../lambda/', lambdaFunctionName, 'policy.json')).toString();
} catch (err) {
    console.log(err);
    return;
}

/**
 * Read the setup JSON for the lambda function.
 */
try {
    var lambdaSetup = JSON.parse(fs.readFileSync(path.join(__dirname, '../lambda/', lambdaFunctionName, 'setup.json')).toString());
} catch (err) {
    console.log(err);
    return;
}

/**
 * Read the lambda function's production source code.
 */
try {
    var lambdaSource = fs.readFileSync(path.join(__dirname, '../dist/', lambdaFunctionName + '.js'));
} catch (err) {
    console.log('Failed to zip the source code', err);
    return Promise.resolve();
}

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
 * Create or update the role for the lambda function.
 */
var role = null;
var lambdaFunction = null;

iam.getRole({RoleName: roleName /* required */}).promise()
    .then(function (response) {
        role = response.Role;
    })
    .catch(function () {
    })
    .then(function () {
        if (role === null) {
            return iam.createRole({
                AssumeRolePolicyDocument: assumeRolePolicyDocument, /* required */
                RoleName: roleName, /* required */
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
                });
        }
    })
    .catch(function (err) {
        console.log(err, err.stack);
        return null;
    })
    /**
     * Make sure the role is deployed.
     */
    .then(function(){
        return iam.getRole({RoleName: roleName /* required */}).promise()
            .then(function (response) {
                console.log('Successfully created/updated role [' + roleName + ']', response.Role);
            })
            .catch(function (err) {
                console.log('Failed to created/updated role [' + roleName + ']', err, err.stack);
            })
    })
    /**
     * Zip the source code.
     */
    .then(function() {
        var zip = new JSZip();
        zip.file("index.js", lambdaSource);
        return zip.generateAsync({type: 'nodebuffer'});
    })
    /**
     * Create or update the lambda function.
     */
    .then(function (lambdaFunctionZip) {
        lambda.getFunction({FunctionName: lambdaFunctionName /* required */}).promise()
            .then(function (response) {
                lambdaFunction = response.Configuration;
            })
            .catch(function (err) {
            })
            .then(function () {
                var createParams = Object.assign({
                    Code: {
                        /* required */
                        ZipFile: lambdaFunctionZip
                    },
                    FunctionName: lambdaFunctionName, /* required */
                    Role: role.Arn, /* required */
                    Runtime: 'nodejs4.3' /* required */
                }, lambdaSetup);
                if (lambdaFunction === null) {
                    lambda.createFunction(createParams).promise()
                        .then(function (response) {
                            console.log('Successfully created lambda [' + lambdaFunctionName + ']', response);
                        })
                        .catch(function (err) {
                            console.log('Failed to create lambda [' + lambdaFunctionName + ']', err, err.stack);
                        });
                } else {
                    lambda.updateFunctionCode({
                        FunctionName: lambdaFunctionName, /* required */
                        Publish: true,
                        ZipFile: lambdaFunctionZip
                    }).promise()
                        .then(function (response) {
                            console.log('Successfully updated lambda [' + lambdaFunctionName + ']', response);
                        })
                        .catch(function (err) {
                            console.log('Failed to update lambda [' + lambdaFunctionName + ']', err, err.stack);
                        });
                }
            });
    });