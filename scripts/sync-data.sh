#!/bin/sh

cd COVID-19
git pull origin master
cd -
node ./scripts/gendata.js
