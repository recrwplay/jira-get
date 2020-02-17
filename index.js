/*** 
* Using the JIRA Rest API to get issues and create a json object
***/

// const assert = require('assert');
const request = require('request');
const eLogger = require('electron-log');
const querystring = require('querystring');
const opn = require('opn');

const express = require('express'),
util = require('util'),
OAuth = require('oauth').OAuth,
fse = require('fs-extra'),
path = require('path');

const app = express();
let port = parseInt(process.env.PORT || 8081);

/***** ARGS AND USAGE *****/
const argv = require('yargs')
    .default('userOptsFile','user.json')
    .default('appFile', 'app.json')
    .default('outputFormatter','release-notes.js')
    .alias('m','mode')
    .alias('f','file')
    .alias('o','output')
    .alias('j','jiraOptsFile')
    .alias('u','userOptsFile')
    .demandOption('jiraOptsFile')
    .demandOption('mode')
    .argv;

// eLogger.info(argv)

/***** OPTS FILE *****/
let optsDir = path.join(__dirname,'opts');
let jiraOpts;
if (argv.mode === "get") {

    if (!argv.jiraOptsFile) {
        throw new Error('Get mode specified, but no jira opts file found')
    }
    
}

if (argv.jiraOptsFile) {
    // read the opts file
    try {
        jiraOpts = JSON.parse(fse.readFileSync(path.join(optsDir,argv.jiraOptsFile), 'utf8'));
    } catch (err) {
        eLogger.error(err);
        throw new Error(err);
    }
    
    Object.keys(jiraOpts).forEach(function(opt) {
        argv[opt] = jiraOpts[opt];
    })
}

eLogger.info(argv)

/***** USER OPTS *****/
let userOpts;
if (argv.userOptsFile) {
    // read the opts file
    try {
        userOpts = JSON.parse(fse.readFileSync(path.join(optsDir,argv.userOptsFile), 'utf8'));
    } catch (err) {
        eLogger.error(err);
        throw new Error(err);
    }
    
} else {
    throw new Error('no user opts file')
}

// get app details
let credentials;
try {
    credentials = JSON.parse(fse.readFileSync(path.join(optsDir,argv.appFile), 'utf8'));
} catch (err) {
    eLogger.error(err);
    throw new Error(err);
}

/***** DIRS *****/
let srcDir = path.join(__dirname,'src');
let outputDir = path.join(__dirname,'output');
let projOutputDir = path.join(outputDir,argv.jira.project);
let htmlOutputDir = path.join(projOutputDir,'Content');

if (argv.mode === 'get') {
    rawJSONPath = path.join(srcDir,argv.jira.project,'raw','raw-'+argv.jira.project+'-sprint-'+argv.jira.sprint.value+'.json')
    // let localJSONPath = path.join(__dirname,'./issues.json')
    workingJSONFileName = 'working-' + argv.jira.project + '-sprint-' + argv.jira.sprint.value + '-' + Date.now() + '.json';
    workingJSONPath = path.join(srcDir,argv.jira.project, 'working',workingJSONFileName);
}

// get the initial API token to send to JIRA to exchange
let tokenBuff = Buffer.from(userOpts.user + ':' + userOpts.token);
let base64Token = tokenBuff.toString('base64');

// a URL to redirect to, where we will get an auth token from
oauthURL = `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=${credentials.app.appID}&scope=read%3Ajira-work&redirect_uri=http%3A%2F%2Flocalhost%3A8081%2Fsessions%2Fcallback&state=${base64Token}&response_type=code&prompt=consent`;


if (argv.mode === 'get') {

    if (argv.local) {
        // use a local file already got from jira
        // this is mostly a debug option
        makeWorkingJSON();
    } else {
        let badParms = 0;
        // do we have all the parms?
        if (!argv.jira.sprint) {
            eLogger.error('No sprint specified')
            badParms++;
        }
        if (!argv.jira.project) {
            eLogger.error('No project specified')
            badParms++;
        }
        if (!argv.jira.resourceName) {
            eLogger.error('No resource name specified')
            badParms++;
        }
        if (badParms > 0 ) {
            throw new Error('bad options or required options missing')
        }
        // get stuff from jira and save as local file
        app.listen(port, function() {
            console.log("Server is listening on port " + port);
            opn('http://localhost:8081/auth')
        });
    }

}

if (argv.mode === 'make') {

    // read the working json file
    if (!argv.file) {
        eLogger.error('no file specified')
        throw new Error('no file to make output from')
    }
    let rnJSON = JSON.parse(fse.readFileSync(path.join(srcDir,argv.jira.project,'working',argv.file), 'utf8'));
    
    const formatter = require(path.join(optsDir,argv.outputFormatter));

    // convert to html and write files
    return formatter.makeReleaseNotesHTML(rnJSON,htmlOutputDir)
    .then(function(htmlOut) {
        let sprintSafe = rnJSON.opts.jira.sprint.value.replace(/ /g,'-').toLowerCase();
        let outputPath = path.join(htmlOutputDir,'latest-release-' + sprintSafe + '.htm');
        try {
            writeFile(outputPath,htmlOut)
        } 
        catch(err) {
            eLogger.error(err)
            throw new Error(err)
        }
    });
    
        
}

function makeWorkingJSON() {
    let rawJSON = JSON.parse(fse.readFileSync(rawJSONPath, 'utf8'));

    return new Promise(function(resolve, reject) {
        makeJSON(rawJSON)
        .then(function(stuff) {
            return writeFile(workingJSONPath,stuff);
        })
        .then(function(outputPath) {

            // at this point we've made some json that can be consumed
            resolve(outputPath);

            // let rnJSON = JSON.parse(fse.readFileSync(outputPath), 'utf8');
            // return makeReleaseNotesHTML(rnJSON);
        })
        // .then(function(outputPath) {
        //     resolve(outputPath);
        // })
        .catch(function (err) {
            eLogger.warn(err);
            reject(err);
        });
        
    });

}

app.use(express.static(__dirname + '/output'));

app.get('/', function(req, resp){
    resp.redirect(oauthURL);
  	// resp.send('<p>This page left intentionally blank');
});

// go to /auth to be redirected to JIRA
app.get("/auth", function(req,resp) {
    resp.redirect(oauthURL);
    eLogger.info('redirected to oauthURL')
  });

app.get('/sessions/connect', function(req, resp){

});

app.get('/release-notes', function(req,resp) {
    resp.send('<p>Success!</p>');
})

// if we get to /authed it means we have the token we need to make API requests
app.get("/authed", function(req,res) {
    // eLogger.info(req.query)
    let accessToken = req.query.token;
    eLogger.info('---in /authed - GOT A TOKEN---\n')

    // accessible-resources will get us the id of the JIRA instance (ie infogix.atlassian.net)
    let url = 'https://api.atlassian.com/oauth/token/accessible-resources';

    let options = {
        method: 'GET',
        url: url,
        auth: {
            bearer: accessToken
        },
        headers: {
            'Accept': 'application/json'
        }
    };

    return getJiraResources(options)
    .then(function(body){
        return getJiraID(JSON.parse(body))
            .then(function(resp){
                return getJIRAIssues(resp,accessToken)
                .then(function(issues){
                    return makeWorkingJSON()
                    .then(function(resp) {
                        eLogger.info(resp)
                        let rnFile = path.relative(outputDir,resp).replace(/\\/g,'/');
                        res.redirect(rnFile)
                    })
                })
            })
    })
    .catch(function (err) {
        eLogger.warn(err);
        process.exit(1);
    });

});

function getJiraResources(options) {
    return new Promise(function(resolve, reject) {
        request(options, function (error, response, body) {
            if (error) {
                reject(error)
            }
            resolve(body)
        })
    });
}

// get the JIRA instance ID from the data returned by the accessible-resources API call
function getJiraID(json) {
    // eLogger.info(json)
    return new Promise(function (resolve, reject) {
        json.forEach(function(item){
            if (item.name === argv.jira.resourceName) {
                // eLogger.info('resource id: ' + item.id)
                resolve(item.id);
            }
        })
        reject(argv.jira.resourceName + ' not found')
    });
};

function getJIRAIssues(cloudid,accessToken) {
    eLogger.info('Get issues from JIRA');

    let jql;

    // sample jql
    if (argv.jira.sprint) {
        jql = "project = " + argv.jira.project + " AND '" + argv.jira.sprint.field + "' = '" + argv.jira.sprint.value + "' ORDER BY created DESC";
    }

    jql = (argv.jira.filter) ? argv.jira.filter : jql ;

    if (!jql) {
        throw new Error('no jql')
    }

    let defaultFields = [
        "summary",
        "status",
        "issuetype",
    ];
    let fields = (argv.jira.fields) ? JSON.stringify(argv.jira.fields) : JSON.stringify(defaultFields) ;
    
    let bodyData = `{
        "jql": "${jql}",
        "startAt": 0,
        "fields": ${fields},
        "fieldsByKeys": false,
        "expand": ["renderedFields"]
        }`;

    // using the POST version of the call, because it's easier to pass the bodyData than using the GET version
    let options = {
        method: 'POST',
        url: 'https://api.atlassian.com/ex/jira/' + cloudid + '/rest/api/3/search',
        auth: { bearer: accessToken },
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: bodyData
    };
    
    // send the request and write the result to a json file for reference
    return new Promise(function (resolve, reject) {
        request(options, function (error, response, body) {

            // error response
            if (error) {
                eLogger.error(error);
                reject(error);
            }

            // 200 OK response
            if (response.statusCode === 200) {
                let details = JSON.parse(body);

                try {
                    fse.ensureDirSync(path.join(srcDir,argv.jira.project,'raw'));
                    fse.writeJsonSync(rawJSONPath, details.issues)
                    resolve(details.issues)                            
                } catch(err) {
                    reject(err)
                }
            }

            // Other response...
            else {
                reject('JIRA query failed with response code ' + response.statusCode);
            }
        });
    
    
    });
}

// strip away all the crap from the JSON response from JIRA that we don't need, and add fields for titles and category

function makeJSON(issues) {
    eLogger.info('making json from jira issues')
    let issuesJSON = {
        "issues": []
    };
    return new Promise(function (resolve, reject) {

        try {
            issues.forEach(function(issue) {

                let parsedIssue = {
                    "key": issue.key,
                    "summary": issue.fields.summary,
                    "fields": issue.fields          
                }

                if ( argv.jira.renderedFields ) {
                    parsedIssue.renderedFields = issue.renderedFields
                }

                issuesJSON.issues.push(parsedIssue)

                
            });
        
        } catch(err) {
            reject(err)
        } finally {
            // eLogger.info(issuesJSON)
            
        }
        let jsonOut = {
            "opts": argv,
            "issues": issuesJSON
        }
        resolve(jsonOut);
    });

}

function writeFile(outputPath,content) {
    eLogger.info('writing ' + outputPath)
    return new Promise(function (resolve, reject) {
        let overwrite = true;
        
        try {
            fse.ensureDirSync(path.dirname(outputPath));
        } catch (err) {
            eLogger.error(err);
        }

        try {
            var writeHTMLFd = fse.openSync(outputPath, overwrite ? "w" : "wx");
        } catch(err) {
            eLogger.warn("Failed to open file to write: " + outputPath + "\n" + err.toString());
            reject(err)
        }

        try {

            if (path.extname(outputPath) === '.json') {
                fse.writeJsonSync(outputPath, content)
            } else {
                fse.writeSync(writeHTMLFd, Buffer.from(content))
            }            
            
        } catch(err) {
            eLogger.warn("Failed to write output: " + outputPath + "\n" + err.toString());
            reject(err)
        }
        eLogger.info('json written to ' + outputPath)
        resolve(outputPath);
    })

}



app.get('/sessions/callback', function(req, res){
    eLogger.info('---at the callback url - /sessions/callback---')
	var data = {
        'client_id' : credentials.app.appID,
        'client_secret' : credentials.app.appSecret,
        'grant_type' : 'authorization_code',
        'redirect_uri' : 'http://localhost:8081/sessions/callback',
        'code' : req.query.code
       };
    
    let url = 'https://auth.atlassian.com/oauth/token';

    let options = {
        method: 'POST',
        url: url,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data),
    };

    // eLogger.info(options)

    request(options, function (error, resp, body) {
        let details = JSON.parse(body);
        accessToken = details.access_token;
        eLogger.info('redirecting to /authed?token=...')
        if (accessToken) {
            res.redirect(`/authed?token=${accessToken}`);
        } else {
            throw new Error(details.error)
        }
        
    });
});

module.exports = {
    writeFile
}