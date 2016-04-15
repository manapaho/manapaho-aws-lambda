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
 * SES API access.
 */
const ses = new AWS.SES();

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
        crypto.pbkdf2(password, salt, iterations, len, fn);
    } else {
        fn = salt;
        crypto.randomBytes(len, function(err, salt) {
            if (err) return fn(err);
            salt = salt.toString('base64');
            crypto.pbkdf2(password, salt, iterations, len, function(err, derivedKey) {
                if (err) return fn(err);
                fn(null, salt, derivedKey.toString('base64'));
            });
        });
    }
}

/**
 * Insert a new user into the database.
 * @param email The user's email address.
 * @param password The user's unencrypted password.
 * @param salt The salt to be used to create the user's password hash.
 * @param fn A function to be called when finished.
 */
function storeUser(email, password, salt, fn) {
    // Bytesize
    var len = 128;
    crypto.randomBytes(len, function(err, token) {
        if (err) return fn(err);
        token = token.toString('hex');
        dynamodb.putItem({
            TableName: config.DDB_TABLE,
            Item: {
                email: {
                    S: email
                },
                passwordHash: {
                    S: password
                },
                passwordSalt: {
                    S: salt
                },
                verified: {
                    BOOL: false
                },
                verifyToken: {
                    S: token
                }
            },
            ConditionExpression: 'attribute_not_exists (email)'
        }, function(err, data) {
            if (err) return fn(err);
            else fn(null, token);
        });
    });
}

/**
 * Send a verification email to the user.
 * @param email The user's email address.
 * @param token The verification token to be included in the email.
 * @param fn A function to be called when finished.
 */
function sendVerificationEmail(email, token, fn) {
    var subject = 'Verification Email for ' + config.EXTERNAL_NAME;
    var verificationLink = config.VERIFICATION_PAGE + '?email=' + encodeURIComponent(email) + '&verify=' + token;
    ses.sendEmail({
        Source: config.EMAIL_SOURCE,
        Destination: {
            ToAddresses: [
                email
            ]
        },
        Message: {
            Subject: {
                Data: subject
            },
            Body: {
                Html: {
                    Data: '<html><head>'
                    + '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />'
                    + '<title>' + subject + '</title>'
                    + '</head><body>'
                    + 'Please <a href="' + verificationLink + '">click here to verify your email address</a> or copy & paste the following link in a browser:'
                    + '<br><br>'
                    + '<a href="' + verificationLink + '">' + verificationLink + '</a>'
                    + '</body></html>'
                }
            }
        }
    }, fn);
}

/**
 * The AuthUserRegister Lambda function's options type.
 */
type AuthUserRegisterOptions = {
    url: string,
    method?: string,
    headers?: {[key: string]: string},
    body?: string
};

/**
 * The AuthUserLogin Lambda function.
 *
 * Use this function to register a new user and send a verification email.
 * 
 * @param email The user's email address.
 * @param clearPassword The user's unencrypted password.
 * @param context The Lambda Function Context.
 */
export function handler({
    email,
    clearPassword
}: AuthUserRegisterOptions, context:LambdaContext):void {
    computeHash(clearPassword, function(err, salt, hash) {
        if (err) {
            context.fail('Error in hash: ' + err);
        } else {
            storeUser(email, hash, salt, function(err, token) {
                if (err) {
                    if (err.code == 'ConditionalCheckFailedException') {
                        // userId already found
                        context.succeed({
                            created: false
                        });
                    } else {
                        context.fail('Error in storeUser: ' + err);
                    }
                } else {
                    sendVerificationEmail(email, token, function(err, data) {
                        if (err) {
                            context.fail('Error in sendVerificationEmail: ' + err);
                        } else {
                            context.succeed({
                                created: true
                            });
                        }
                    });
                }
            });
        }
    });
}