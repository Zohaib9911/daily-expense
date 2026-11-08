// react-hook-form resolver for a zod schema, with nested error paths
// (items.0.name -> errors.items[0].name). Client-safe.

function put(obj, path, value) {
  let o = obj;
  path.forEach((key, i) => {
    if (i === path.length - 1) {
      if (o[key] === undefined) o[key] = value;
    } else {
      if (o[key] === undefined) o[key] = typeof path[i + 1] === "number" ? [] : {};
      o = o[key];
    }
  });
}

export const zodResolver = (schema) => async (values) => {
  const r = schema.safeParse(values);
  if (r.success) return { values: r.data, errors: {} };
  const errors = {};
  for (const issue of r.error.issues) {
    put(errors, issue.path.length ? issue.path : ["root"], { type: issue.code, message: issue.message });
  }
  return { values: {}, errors };
};
