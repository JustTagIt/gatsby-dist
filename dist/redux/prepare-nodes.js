"use strict";

const _ = require(`lodash`);

const {
  trackInlineObjectsInRootNode
} = require(`../db/node-tracking`);

const {
  store
} = require(`../redux`);

const {
  getNullableType,
  getNamedType
} = require(`graphql`);

const withResolverContext = require(`../schema/context`);

const enhancedNodeCache = new Map();
const enhancedNodePromiseCache = new Map();

const enhancedNodeCacheId = ({
  node,
  args
}) => node && node.internal && node.internal.contentDigest ? JSON.stringify({
  nodeid: node.id,
  digest: node.internal.contentDigest,
  ...args
}) : null; /////////////////////////////////////////////////////////////////////
// Resolve nodes
/////////////////////////////////////////////////////////////////////


function awaitSiftField(fields, node, k) {
  const field = fields[k];

  if (field.resolve) {
    const {
      schema
    } = store.getState();
    return field.resolve(node, {}, withResolverContext({}, schema), {
      fieldName: k,
      schema,
      returnType: field.type
    });
  } else if (node[k] !== undefined) {
    return node[k];
  }

  return undefined;
} // Resolves every field used in the node.


function resolveRecursive(node, siftFieldsObj, gqFields) {
  return Promise.all(_.keys(siftFieldsObj).map(k => Promise.resolve(awaitSiftField(gqFields, node, k)).then(v => {
    const innerSift = siftFieldsObj[k];
    const innerGqConfig = gqFields[k];
    const innerType = getNullableType(innerGqConfig.type);
    const innerListType = getNamedType(innerType);

    if (_.isObject(innerSift) && v != null && innerType) {
      if (_.isFunction(innerType.getFields)) {
        // this is single object
        return resolveRecursive(v, innerSift, innerType.getFields());
      } else if (_.isArray(v) && _.isFunction(innerListType.getFields)) {
        // this is array
        return Promise.all(v.map(item => resolveRecursive(item, innerSift, innerListType.getFields())));
      }
    }

    return v;
  }).then(v => [k, v]))).then(resolvedFields => {
    const myNode = { ...node
    };
    resolvedFields.forEach(([k, v]) => myNode[k] = v);
    return myNode;
  });
}

function resolveNodes(nodes, typeName, firstOnly, fieldsToSift, gqlFields) {
  const {
    resolvedNodesCache
  } = store.getState();
  const nodesCacheKey = JSON.stringify({
    // typeName + count being the same is a pretty good
    // indication that the nodes are the same.
    typeName,
    firstOnly,
    nodesLength: nodes.length,
    ...fieldsToSift
  });

  if (resolvedNodesCache.has(nodesCacheKey)) {
    return Promise.resolve(resolvedNodesCache.get(nodesCacheKey));
  } else {
    return Promise.all(nodes.map(node => {
      const cacheKey = enhancedNodeCacheId({
        node,
        args: fieldsToSift
      });

      if (cacheKey && enhancedNodeCache.has(cacheKey)) {
        return Promise.resolve(enhancedNodeCache.get(cacheKey));
      } else if (cacheKey && enhancedNodePromiseCache.has(cacheKey)) {
        return enhancedNodePromiseCache.get(cacheKey);
      }

      const enhancedNodeGenerationPromise = new Promise(resolve => {
        resolveRecursive(node, fieldsToSift, gqlFields).then(resolvedNode => {
          trackInlineObjectsInRootNode(resolvedNode);

          if (cacheKey) {
            enhancedNodeCache.set(cacheKey, resolvedNode);
          }

          resolve(resolvedNode);
        });
      });
      enhancedNodePromiseCache.set(cacheKey, enhancedNodeGenerationPromise);
      return enhancedNodeGenerationPromise;
    })).then(resolvedNodes => {
      store.dispatch({
        type: `SET_RESOLVED_NODES`,
        payload: {
          key: nodesCacheKey,
          nodes: resolvedNodes
        }
      });
      return resolvedNodes;
    });
  }
}

module.exports = {
  resolveNodes,
  resolveRecursive
};
//# sourceMappingURL=prepare-nodes.js.map