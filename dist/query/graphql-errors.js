"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

exports.__esModule = true;
exports.multipleRootQueriesError = multipleRootQueriesError;
exports.graphqlValidationError = graphqlValidationError;
exports.graphqlError = graphqlError;

var _graphql = require("graphql");

var _codeFrame = require("@babel/code-frame");

var _lodash = _interopRequireDefault(require("lodash"));

var _reporter = _interopRequireDefault(require("gatsby-cli/lib/reporter"));

// These handle specific errors throw by RelayParser. If an error matches
// you get a pointer to the location in the query that is broken, otherwise
// we show the error and the query.
const handlers = [[/Unknown field `(.+)` on type `(.+)`/i, ([name], node) => {
  if (node.kind === `Field` && node.name.value === name) {
    return node.name.loc;
  }

  return null;
}], [/Unknown argument `(.+)`/i, ([name], node) => {
  if (node.kind === `Argument` && node.name.value === name) {
    return node.name.loc;
  }

  return null;
}], [/Unknown directive `@(.+)`/i, ([name], node) => {
  if (node.kind === `Directive` && node.name.value === name) {
    return node.name.loc;
  }

  return null;
}]];

function formatFilePath(filePath) {
  return `${_reporter.default.format.bold(`file:`)} ${_reporter.default.format.blue(filePath)}`;
}

function formatError(message, filePath, codeFrame) {
  return _reporter.default.stripIndent`
    ${message}

      ${formatFilePath(filePath)}
  ` + `\n\n${codeFrame}\n`;
}

function extractError(error) {
  const docRegex = /Error:.(RelayParser|GraphQLParser):(.*)Source: document.`(.*)`.file.*(GraphQL.request.*^\s*$)/gms;
  let matches;
  let message = ``;
  let docName = ``;
  let codeBlock = ``;

  while ((matches = docRegex.exec(error.toString())) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (matches.index === docRegex.lastIndex) docRegex.lastIndex++;
    [,, message, docName, codeBlock] = matches;
  }

  if (!message) {
    message = error.toString();
  }

  message = message.trim();
  return {
    message,
    codeBlock,
    docName
  };
}

function findLocation(extractedMessage, def) {
  let location = null;
  (0, _graphql.visit)(def, {
    enter(node) {
      if (location) return;

      for (let [regex, handler] of handlers) {
        let match = extractedMessage.match(regex);
        if (!match) continue;
        if (location = handler(match.slice(1), node)) break;
      }
    }

  });
  return location;
}

function getCodeFrame(query, line, column) {
  return (0, _codeFrame.codeFrameColumns)(query, {
    start: {
      line,
      column
    }
  }, {
    linesAbove: 10,
    linesBelow: 10
  });
}

function getCodeFrameFromRelayError(def, extractedMessage, error) {
  let {
    start,
    source
  } = findLocation(extractedMessage, def) || {};
  let query = source ? source.body : (0, _graphql.print)(def); // we can't reliably get a location without the location source, since
  // the printed query may differ from the original.

  let {
    line,
    column
  } = source && (0, _graphql.getLocation)(source, start) || {};
  return getCodeFrame(query, line, column);
}

function multipleRootQueriesError(filePath, def, otherDef) {
  let name = def.name.value;
  let otherName = otherDef.name.value;
  let unifiedName = `${_lodash.default.camelCase(name)}And${_lodash.default.upperFirst(_lodash.default.camelCase(otherName))}`;
  return formatError(`Multiple "root" queries found in file: "${name}" and "${otherName}". ` + `Only the first ("${otherName}") will be registered.`, filePath, `  ${_reporter.default.format.yellow(`Instead of:`)} \n\n` + (0, _codeFrame.codeFrameColumns)(_reporter.default.stripIndent`
        query ${otherName} {
          bar {
            #...
          }
        }

        query ${name} {
          foo {
            #...
          }
        }
      `, {
    start: {
      column: 0,
      line: 0
    }
  }, {
    linesBelow: Number.MAX_SAFE_INTEGER
  }) + `\n\n  ${_reporter.default.format.green(`Do:`)} \n\n` + (0, _codeFrame.codeFrameColumns)(_reporter.default.stripIndent`
        query ${unifiedName} {
          bar {
            #...
          }
          foo {
            #...
          }
        }
      `, {
    start: {
      column: 0,
      line: 0
    }
  }, {
    linesBelow: Number.MAX_SAFE_INTEGER
  }));
}

function graphqlValidationError(errors, filePath, doc) {
  if (!errors || !errors.length) return ``;
  let error = errors[0];
  let {
    source,
    locations: [{
      line,
      column
    }] = [{}]
  } = error;
  let query = source ? source.body : (0, _graphql.print)(doc);
  return formatError(error.message, filePath, getCodeFrame(query, line, column));
}

function graphqlError(namePathMap, nameDefMap, error) {
  let codeBlock;
  let {
    message,
    docName
  } = extractError(error);
  let filePath = namePathMap.get(docName);

  if (filePath && docName) {
    codeBlock = getCodeFrameFromRelayError(nameDefMap.get(docName), message, error);
    const formattedMessage = formatError(message, filePath, codeBlock);
    return {
      formattedMessage,
      docName,
      message,
      codeBlock
    };
  }

  let reportedMessage = `There was an error while compiling your site's GraphQL queries.
  ${message || error.message}
    `;

  if (error.message.match(/must be an instance of/)) {
    reportedMessage += `This usually means that more than one instance of 'graphql' is installed ` + `in your node_modules. Remove all but the top level one or run \`npm dedupe\` to fix it.`;
  }

  if (error.message.match(/Duplicate document/)) {
    reportedMessage += `${error.message.slice(21)}\n`;
  }

  return {
    formattedMessage: reportedMessage,
    docName,
    message,
    codeBlock
  };
}
//# sourceMappingURL=graphql-errors.js.map