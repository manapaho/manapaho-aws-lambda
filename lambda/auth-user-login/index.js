/* @flow */

/**
 * Import dependencies.
 */
import AWS from 'aws-sdk';
import crypto from 'crypto';
import config  from '../config.json';

/**
 * Import flow types.
 */
import type {LambdaContext} from "../../lib/lambda-types.js";

/**
 * Lambda function is loading.
 */
console.log('Loading function');

/**
 * DynamoDB API access.
 */
const dynamodb = new AWS.DynamoDB();

/**
 * Cognito API access.
 */
const cognitoidentity = new AWS.CognitoIdentity();

/**
 * Create a hash value for a password.
 * @param password The password the hash should be created for.
 * @param salt The salt to be used to create the hash.
 * @param fn A function to be called when finished.
 */
function computeHash(password, salt, fn) {
    // Bytesize
    var len = 128;
    var iterations = 4096;

    if (3 == arguments.length) {
        crypto.pbkdf2(password, salt, iterations, len, function (err, derivedKey) {
            if (err) return fn(err);
            else fn(null, salt, derivedKey.toString('base64'));
        });
    } else {
        fn = salt;
        crypto.randomBytes(len, function (err, salt) {
            if (err) return fn(err);
            salt = salt.toString('base64');
            computeHash(password, salt, fn);
        });
    }
}

/**
 * Get a user from the database.
 * @param email The user's email address.
 * @param fn A function to be called when finished.
 */
function getUser(email, fn) {
    dynamodb.getItem({
        TableName: config.DDB_TABLE,
        Key: {
            email: {
                S: email
            }
        }
    }, function (err, data) {
        if (err) return fn(err);
        else {
            if ('Item' in data) {
                var hash = data.Item.passwordHash.S;
                var salt = data.Item.passwordSalt.S;
                var verified = data.Item.verified.BOOL;
                fn(null, hash, salt, verified);
            } else {
                fn(null, null); // User not found
            }
        }
    });
}

/**
 * Get the authentication token for a given user.
 * @param email The user's email address.
 * @param fn A function to be called when finished.
 */
function getToken(email, fn) {
    var param = {
        IdentityPoolId: config.IDENTITY_POOL_ID,
        Logins: {} // To have provider name in a variable
    };
    param.Logins[config.DEVELOPER_PROVIDER_NAME] = email;
    cognitoidentity.getOpenIdTokenForDeveloperIdentity(param,
        function (err, data) {
            if (err) return fn(err); // an error occurred
            else fn(null, data.IdentityId, data.Token); // successful response
        });
}

/**
 * The AuthUserLogin Lambda function's options type.
 */
type AuthUserLoginOptions = {
    url: string,
    method?: string,
    headers?: {[key: string]: string},
    body?: string
};

/**
 * The AuthUserLogin Lambda function.
 *
 * Use this function to log in an already registered and verified user.
 *
 * @param email The user's email address.
 * @param clearPassword The user's unencrypted password.
 * @param context The Lambda Function Context.
 */
export function handler({
    email,
    clearPassword
}: AuthUserLoginOptions, context:LambdaContext):void {
    getUser(email, function (err, correctHash, salt, verified) {
        if (err) {
            context.fail('Error in getUser: ' + err);
        } else {
            if (correctHash == null) {
                // User not found
                console.log('User not found: ' + email);
                context.succeed({
                    login: false
                });
            } else if (!verified) {
                // User not verified
                console.log('User not verified: ' + email);
                context.succeed({
                    login: false
                });
            } else {
                computeHash(clearPassword, salt, function (err, salt, hash) {
                    if (err) {
                        context.fail('Error in hash: ' + err);
                    } else {
                        console.log('correctHash: ' + correctHash + ' hash: ' + hash);
                        if (hash == correctHash) {
                            // Login ok
                            console.log('User logged in: ' + email);
                            getToken(email, function (err, identityId, token) {
                                if (err) {
                                    context.fail('Error in getToken: ' + err);
                                } else {
                                    context.succeed({
                                        login: true,
                                        identityId: identityId,
                                        token: token
                                    });
                                }
                            });
                        } else {
                            // Login failed
                            console.log('User login failed: ' + email);
                            context.succeed({
                                login: false
                            });
                        }
                    }
                });
            }
        }
    });
}