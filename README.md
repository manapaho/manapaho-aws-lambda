# manapaho-aws-lambda
# Version
0.1.0
## Overview
This repository contains all the lambda functions for the manapaho AWS distribution.
## Development
Develop and run locally with `npm run exec [LAMBDA NAME]'`.
## Test
Run tests locally with `npm run test`.
## Deployment
To deploy you need to build the distribution versions of your lambda function first with `npm prepublish`.
# Single Lambda Deployment
To deploy a single lambda function use `npm run deploy [LAMBDA NAME]`.
# Complete Lambda Deployment
To deploy ALL lambda function use `npm run deploy-all`.
# Continues Deployment
Whenever there is a new version checked into the master branch it will build, test and deploy all lambda functions automatically.