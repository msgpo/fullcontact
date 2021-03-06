'use strict';

let request = require('request');
let _ = require('lodash');
let util = require('util');
let net = require('net');
let config = require('./config/config');
let async = require('async');
let fs = require('fs');
let Logger;

let requestWithDefaults;

const MAX_PARALLEL_LOOKUPS = 10;


/**
 *
 * @param entities
 * @param options
 * @param cb
 */
function doLookup(entities, options, cb) {
    let lookupResults = [];
    let tasks = [];

    Logger.trace(entities);

    entities.forEach(entity => {
        if (entity.value) {
            //do the lookup
            let requestOptions = {
                uri: 'https://api.fullcontact.com/v3/person.enrich',
                method: 'POST',
                headers: {'Authorization': 'Bearer' + " " + options.apiKey},
                body: {email: entity.value},
                json: true
            };

            Logger.debug({uri: requestOptions}, 'Request URI');

            tasks.push(function (done) {
                requestWithDefaults(requestOptions, function (error, res, body) {
                    Logger.debug({body: body, statusCode: res.statusCode}, 'Result of Lookup');

                    if (error) {
                        done(error);
                        return;
                    }

                    let result = {};

                    if (res.statusCode === 200) {
                        // we got data!
                        result = {
                            entity: entity,
                            body: body
                        };
                    }  else if (res.statusCode === 404) {
                        // no result found
                        result = {
                            entity: entity,
                            body: null
                        };
                    } else if (res.statusCode === 400) {
                        // no result found
                        result = {
                            entity: entity,
                            body: null
                        };
                    }else if (res.statusCode === 202) {
                        // no result found
                        done('')
                        return;
                    }else if (res.statusCode === 401) {
                        // no result found
                        done('Unauthorized, please check if API Key is valid')
                        return;
                    }else if (res.statusCode === 403) {
                        // no result found
                        done('API Key contains non-hex values or is otherwise invalid')
                        return;
                    }else if (res.statusCode === 500) {
                        // no result found
                        done('Server Error');
                        return;
                    }else if (res.statusCode === 429) {
                        // no result found
                        done('Request Limit Reached');
                        return;
                    }
                    done(null, result);
                });
            });
        }
    });

    async.parallelLimit(tasks, MAX_PARALLEL_LOOKUPS, (err, results) => {
        if (err) {
            cb(err);
            return;
        }

        results.forEach(result => {
            Logger.debug({data: result.body}, "Data Results");
            if (result.body === null) {
                lookupResults.push({
                    entity: result.entity,
                    data: null
                });
            } else if (result.body.message === "Searched within last 24 hours. No results found for this Id.") {
                lookupResults.push({
                    entity: result.entity,
                    data: null
                });
            }else {
                lookupResults.push({
                    entity: result.entity,
                    data: {
                        summary: [],
                        details: result.body
                    }

                });
            }
        });

        cb(null, lookupResults);
    });
}

function startup(logger) {
    Logger = logger;
    let defaults = {};

    if (typeof config.request.cert === 'string' && config.request.cert.length > 0) {
        defaults.cert = fs.readFileSync(config.request.cert);
    }

    if (typeof config.request.key === 'string' && config.request.key.length > 0) {
        defaults.key = fs.readFileSync(config.request.key);
    }

    if (typeof config.request.passphrase === 'string' && config.request.passphrase.length > 0) {
        defaults.passphrase = config.request.passphrase;
    }

    if (typeof config.request.ca === 'string' && config.request.ca.length > 0) {
        defaults.ca = fs.readFileSync(config.request.ca);
    }

    if (typeof config.request.proxy === 'string' && config.request.proxy.length > 0) {
        defaults.proxy = config.request.proxy;
    }

    requestWithDefaults = request.defaults(defaults);
}

function validateOptions(userOptions, cb) {
    let errors = [];
    if (typeof userOptions.apiKey.value !== 'string' ||
        (typeof userOptions.apiKey.value === 'string' && userOptions.apiKey.value.length === 0)) {
        errors.push({
            key: 'apiKey',
            message: 'You must provide a Full Contact API key'
        })
    }
    cb(null, errors);
}


module.exports = {
    doLookup: doLookup,
    startup: startup,
    validateOptions: validateOptions
};
