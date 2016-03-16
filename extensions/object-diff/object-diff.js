"use strict";

var ObjectDiff = undefined;
Loader.OnLoad(function () {
    var currentObjectToDiff = null;
    DbgObject.AddAction("edgehtml", function() { return true; }, "ObjectDiff", function (dbgObject) {
        if (currentObjectToDiff == null) {
            return {
                description: "Diff...",
                action: function () {
                    currentObjectToDiff = dbgObject;
                }
            }
        } else {
            return Promise.join([currentObjectToDiff.baseTypes(), dbgObject.baseTypes()])
            .then(function (bothBaseTypes) {
                bothBaseTypes[0].unshift(currentObjectToDiff);
                bothBaseTypes[1].unshift(dbgObject);

                var results = [];

                // Find a common type.
                for (var i = 0; i < bothBaseTypes[0].length && results.length == 0; ++i) {
                    for (var j = 0; j < bothBaseTypes[1].length; ++j) {
                        if (bothBaseTypes[0][i].typeDescription() == bothBaseTypes[1][j].typeDescription() && bothBaseTypes[0][i].equals(currentObjectToDiff) && bothBaseTypes[1][j].equals(dbgObject)) {
                            results.push({
                                description: "Diff with " + bothBaseTypes[0][i].htmlTypeDescription() + " " + currentObjectToDiff.ptr(),
                                action: "/objectdiff/?type=" + bothBaseTypes[0][i].module + "!" + bothBaseTypes[0][i].typeDescription() + "&address1=" + bothBaseTypes[0][i].ptr() + "&address2=" + bothBaseTypes[1][j].ptr()
                            });
                            break;
                        }
                    }
                }

                results.push({
                    description: "Diff...",
                    action: function() {
                        currentObjectToDiff = dbgObject;
                    }
                });

                return results;
            })
        }
    })

    function getDifferentFields(object1, object2, expansion) {
        if (object1.typeDescription() != object2.typeDescription()) {
            throw new Error("Objects passed to GetDifferentFields must be the same type.");
        }

        if (expansion === undefined) {
            expansion = function(field, object1, object2) { return [field.name]; };
        }

        var typeSize = object1.size();
        var fields = object1.fields();

        return Promise.join([fields, object1.as("unsigned char", true).vals(typeSize), object2.as("unsigned char", true).vals(typeSize)])
        .then(function (results) {
            var fields = results[0];
            var object1Bytes = results[1];
            var object2Bytes = results[2];

            // Get the bytes that are different.
            var differentBytes = {};
            for (var i = 0; i < object1Bytes.length; ++i) {
                if (object1Bytes[i] != object2Bytes[i]) {
                    differentBytes[i] = true;
                }
            }

            // Get the fields that are different.
            var differentFields = [];
            fields.forEach(function (field, fieldIndex) {
                // Iterate over the bytes that the field covers to see it's covered.
                for (var byte = 0; byte < field.size; ++byte) {
                    if (differentBytes[field.offset + byte]) {
                        differentFields.push(fieldIndex);
                        break;
                    }
                }
            });

            // Return the field names.
            return Promise.map(
                Promise.filter(differentFields, function (fieldIndex) {
                    var field = fields[fieldIndex];
                    if (field.value.bitcount > 0) {
                        // For fields with bitcounts, compare the actual values.
                        return Promise.join([object1.f(field.name).val(), object2.f(field.name).val()])
                        .then(function (values) {
                            return values[0] != values[1];
                        })
                    } else {
                        return true;
                    }
                }),
                function (fieldIndex) {
                    // Allow the caller to expand the fields if desired.
                    return expansion(fields[fieldIndex], object1, object2);
                }
            );
        })
        .then(function (nestedResults) {
            // Flatten the nested results.
            var results = [];
            function flatten(array) {
                array.forEach(function (item) {
                    if (Array.isArray(item)) {
                        flatten(item);
                    } else {
                        results.push(item);
                    }
                })
            }
            flatten(nestedResults);
            return results;
        })
    }

    ObjectDiff = {
        GetDifferentFields: getDifferentFields
    };
})