# jira-get

Get some stuff from jira, create json from it. Optionally, turn that json into an output, eg html.

## sample usage

`node index.js -m=get -j=opts-file.json`

then

`node index.js -m=make -j=opts-file.json -f=working-json.json`

where working-json.json is the output from the get command - it's in the working dir, parsed from the file in the raw dir that was pulled from jira
