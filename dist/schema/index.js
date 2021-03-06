"use strict";

const tracer = require(`opentracing`).globalTracer();

const {
  store
} = require(`../redux`);

const nodeStore = require(`../db/nodes`);

const {
  createSchemaComposer
} = require(`./schema-composer`);

const {
  buildSchema,
  rebuildSchemaWithSitePage
} = require(`./schema`);

const {
  builtInFieldExtensions
} = require(`./extensions`);

const {
  TypeConflictReporter
} = require(`./infer/type-conflict-reporter`);

const apiRunner = require(`../utils/api-runner-node`);

module.exports.build = async ({
  parentSpan
}) => {
  const spanArgs = parentSpan ? {
    childOf: parentSpan
  } : {};
  const span = tracer.startSpan(`build schema`, spanArgs);
  Object.keys(builtInFieldExtensions).forEach(name => {
    const extension = builtInFieldExtensions[name];
    store.dispatch({
      type: `CREATE_FIELD_EXTENSION`,
      payload: {
        name,
        extension
      }
    });
  });
  await apiRunner(`createSchemaCustomization`, {
    parentSpan,
    traceId: `initial-createSchemaCustomization`
  });
  const {
    schemaCustomization: {
      thirdPartySchemas,
      types,
      fieldExtensions
    },
    config: {
      mapping: typeMapping
    }
  } = store.getState();
  const typeConflictReporter = new TypeConflictReporter(); // Ensure that user-defined types are processed last

  const sortedTypes = types.sort(type => type.plugin && type.plugin.name === `default-site-plugin`);
  const schemaComposer = createSchemaComposer({
    fieldExtensions
  });
  const schema = await buildSchema({
    schemaComposer,
    nodeStore,
    types: sortedTypes,
    fieldExtensions,
    thirdPartySchemas,
    typeMapping,
    typeConflictReporter,
    parentSpan
  });
  typeConflictReporter.printConflicts();
  store.dispatch({
    type: `SET_SCHEMA_COMPOSER`,
    payload: schemaComposer
  });
  store.dispatch({
    type: `SET_SCHEMA`,
    payload: schema
  });
  span.finish();
};

module.exports.rebuildWithSitePage = async ({
  parentSpan
}) => {
  const spanArgs = parentSpan ? {
    childOf: parentSpan
  } : {};
  const span = tracer.startSpan(`rebuild schema with SitePage context`, spanArgs);
  const {
    schemaCustomization: {
      composer: schemaComposer,
      fieldExtensions
    },
    config: {
      mapping: typeMapping
    }
  } = store.getState();
  const typeConflictReporter = new TypeConflictReporter();
  const schema = await rebuildSchemaWithSitePage({
    schemaComposer,
    nodeStore,
    fieldExtensions,
    typeMapping,
    typeConflictReporter,
    parentSpan
  });
  typeConflictReporter.printConflicts();
  store.dispatch({
    type: `SET_SCHEMA_COMPOSER`,
    payload: schemaComposer
  });
  store.dispatch({
    type: `SET_SCHEMA`,
    payload: schema
  });
  span.finish();
};
//# sourceMappingURL=index.js.map