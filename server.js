'use strict';

const async = require('async');
const express = require('express');
const http = require('http');
const _ = require('lodash');
const Runner = require('swagger-node-runner');
const yamljs = require('yamljs');

if (process.argv.length <= 2) {
  console.error('Usage: node server.js [SWAGGER_FILE]');
  process.exit(1);
}

const app = express();

app.use(function (req, res, next) {
  if (req.method === 'OPTIONS') {
    var ALLOWED_HEADERS = [
      'Accept',
      'Accept-Encoding',
      'Accept-Version',
      'Allow',
      'Authorization',
      'Cache-Control',
      'Content-Type',
      'Origin',
      'Pragma',
      'Set-Cookie',
      'X-Prototype-Version',
      'X-Requested-With',
      'X-Sagely-Client'
    ];
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(','));
    res.header('Access-Control-Expose-Headers', 'X-Server-Version');
    res.header('Access-Control-Max-Age', 60 * 60 * 24 * 365);
  }

  next();
});

process.env.SUPPRESS_NO_CONFIG_WARNING = 'y';
async.each(_.drop(process.argv, 2), function (arg, callback) {

  var createRunner = function (doc, callback) {
    Runner.create({
      appRoot: '.',
      startWithErrors: true,
      swagger: doc,
      fittingsDirs: [ './fittings' ],
      defaultPipe: 'swagger_controllers',
      swaggerControllerPipe: 'swagger_controllers',
      bagpipes: {
        '_swagger_params_parser': {
          name: 'swagger_params_parser',
          jsonOptions: {
            type: ['json', 'application/*+json'],
            limit: 5 * 1024 * 1024
          }
        },
        _router: {
          name: 'swagger_router',
          mockMode: false,
          mockControllersDirs: [ 'api/mocks' ],
          controllersDirs: [ './controllers' ]
        },
        'any_controllers': [
          'cors',
          'any_handler',
          '_swagger_params_parser',
          '_router'
        ],
        'swagger_controllers': [
          'cors',
          '_swagger_params_parser',
          '_router'
        ]
      }
    }, function (err, runner) {
      if (err) {
        callback(err);
        return;
      }
      runner.expressMiddleware().register(app);
      callback();
    });
  };

  var swaggerDoc = yamljs.load(arg);
  if (swaggerDoc.swagger) {
    createRunner(swaggerDoc, callback);
  } else if (swaggerDoc.Resources) {
    async.each(_.filter(swaggerDoc.Resources, { Type: 'AWS::ApiGateway::RestApi' }), function (resource, callback) {
      createRunner(resource.Properties.Body, callback);
    }, callback);
  } else {
    callback(new Error('Invalid swagger YAML document: ' + arg));
  }
}, function (err) {
  if (err) {
    console.error(err);
  } else {
    const port = process.env.API_GW_PORT || 7111;
    http.createServer(app).listen(port, function () {
      console.log('API Gateway server listening on port ' + port);
    });
  }
});
