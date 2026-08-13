import {
    toJson,
    ScalarType,
    type DescField,
    type DescEnum,
    type DescMessage,
    type Message,
    type JsonValue
} from '@bufbuild/protobuf';
import { reflect, type ReflectMessage } from '@bufbuild/protobuf/reflect';
import { FeatureSet_FieldPresence } from '@bufbuild/protobuf/wkt';
import { enumJsonName } from '~/server/utils/api/v2/requestValidator';

type ListField = DescField & { fieldKind: 'list' };
type MapField = DescField & { fieldKind: 'map' };
type ItemScalarField = { scalar: ScalarType };
type ItemEnumField = { enum: DescEnum };
type ItemMessageField = { message: DescMessage };

const INT64_SCALAR_TYPES = new Set<ScalarType>([
    ScalarType.INT64,
    ScalarType.UINT64,
    ScalarType.FIXED64,
    ScalarType.SFIXED64,
    ScalarType.SINT64
]);

const WKT_JSON_MESSAGE_TYPES = new Set([
    'google.protobuf.Struct',
    'google.protobuf.Value',
    'google.protobuf.ListValue'
]);

function encodeBytes(value: Uint8Array): string {
    return Buffer.from(value).toString('base64');
}

function encodeScalar(field: ItemScalarField, value: unknown): JsonValue {
    if (INT64_SCALAR_TYPES.has(field.scalar as ScalarType)) {
        return Number(value as bigint);
    }

    switch (field.scalar as ScalarType) {
        case ScalarType.BYTES:
            return encodeBytes(value as Uint8Array);
        case ScalarType.STRING:
        case ScalarType.BOOL:
        case ScalarType.DOUBLE:
        case ScalarType.FLOAT:
        case ScalarType.INT32:
        case ScalarType.UINT32:
        case ScalarType.SINT32:
        case ScalarType.FIXED32:
        case ScalarType.SFIXED32:
            return value as JsonValue;
        default:
            throw new Error(`unsupported scalar type ${field.scalar}`);
    }
}

function encodeEnum(field: ItemEnumField, value: number): JsonValue {
    if (field.enum.typeName === 'google.protobuf.NullValue') {
        return null;
    }

    if (field.enum.value[value] === undefined) {
        return value;
    }

    return enumJsonName(field.enum, value);
}

function encodeMessage(desc: DescMessage, message: Message): JsonValue {
    if (WKT_JSON_MESSAGE_TYPES.has(desc.typeName)) {
        return toJson(desc, message) as JsonValue;
    }

    const msg = reflect(desc, message as never);
    const json: Record<string, JsonValue> = {};

    for (const field of msg.sortedFields) {
        if (!msg.isSet(field)) {
            if (
                field.presence === FeatureSet_FieldPresence.EXPLICIT ||
                field.fieldKind === 'map'
            ) {
                continue;
            }

            if (field.fieldKind === 'list') {
                json[field.jsonName] = [];
                continue;
            }

            json[field.jsonName] = encodeDefaultField(field);
            continue;
        }

        const value = encodeField(field, msg.get(field));
        if (value !== undefined) {
            json[field.jsonName] = value;
        }
    }

    return json;
}

function encodeDefaultField(field: DescField): JsonValue {
    switch (field.fieldKind) {
        case 'enum':
            return encodeEnum(field as ItemEnumField, 0);
        case 'scalar': {
            const scalar = (field as ItemScalarField).scalar;
            if (scalar === ScalarType.BYTES) {
                return encodeBytes(new Uint8Array(0));
            }
            if (scalar === ScalarType.STRING) {
                return '';
            }
            if (scalar === ScalarType.BOOL) {
                return false;
            }
            return 0;
        }
        default:
            throw new Error(`unsupported default field kind ${String(field)}`);
    }
}

function encodeListItem(field: ListField, item: unknown): JsonValue {
    switch (field.listKind) {
        case 'scalar':
            return encodeScalar(field as ItemScalarField, item);
        case 'enum':
            return encodeEnum(field as ItemEnumField, item as number);
        case 'message':
            return encodeMessage(
                field.message,
                (item as ReflectMessage).message
            );
        default:
            throw new Error(`unsupported list kind ${String(field)}`);
    }
}

function encodeList(field: ListField, list: Iterable<unknown>): JsonValue {
    const values: JsonValue[] = [];

    for (const item of list) {
        values.push(encodeListItem(field, item));
    }

    return values;
}

function encodeMapValue(field: MapField, value: unknown): JsonValue {
    switch (field.mapKind) {
        case 'scalar':
            return encodeScalar(field as ItemScalarField, value);
        case 'enum':
            return encodeEnum(field as ItemEnumField, value as number);
        case 'message':
            return encodeMessage(
                field.message,
                (value as ReflectMessage).message
            );
        default:
            throw new Error(`unsupported map kind ${String(field)}`);
    }
}

function encodeMap(
    field: MapField,
    map: ReadonlyMap<unknown, unknown>
): Record<string, JsonValue> {
    const entries = [...map.entries()];
    const numericKeys = entries.every(([key]) => /^\d+$/.test(String(key)));
    if (numericKeys) {
        entries.sort(([left], [right]) => {
            return Number(left) - Number(right);
        });
    }

    const json: Record<string, JsonValue> = {};
    for (const [key, value] of entries) {
        json[String(key)] = encodeMapValue(field, value);
    }

    return json;
}

function encodeField(field: DescField, value: unknown): JsonValue {
    switch (field.fieldKind) {
        case 'scalar':
            return encodeScalar(field, value);
        case 'enum':
            return encodeEnum(field, value as number);
        case 'message':
            return encodeMessage(
                field.message,
                (value as ReflectMessage).message
            );
        case 'list':
            return encodeList(field, value as Iterable<unknown>);
        case 'map':
            return encodeMap(field, value as ReadonlyMap<unknown, unknown>);
        default:
            throw new Error(`unsupported field kind ${String(field)}`);
    }
}

export function encodeMessageToJson(
    schema: DescMessage,
    message: Message
): JsonValue {
    return encodeMessage(schema, message);
}
