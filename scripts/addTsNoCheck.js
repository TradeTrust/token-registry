const fs = require("fs");
const { glob } = require("glob");

const addTsNoCheck = async () => {
  const files = glob.sync(`${__dirname}/..` + `/src/contracts/**/*.{ts,d.ts}`, { ignore: "node_modules/**" });
  files.forEach((file) => {
    fs.readFile(file, "utf8", (err, data) => {
      if (err) {
        console.error("err", err);
        return;
      }

      data = data.replace(
        `/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */`,
        `/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
// @ts-nocheck`
      );

      fs.writeFile(file, data, "utf8", (err2) => {
        if (err2) {
          console.error("err", err2);
        }
      });
    });
  });
};

addTsNoCheck();
