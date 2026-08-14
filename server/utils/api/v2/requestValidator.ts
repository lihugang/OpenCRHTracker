import type {
    DescEnum,
    DescField,
    DescMessage,
    Message
} from '@bufbuild/protobuf';
import { reflect } from '@bufbuild/protobuf/reflect';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';

function toUpperSnake(name: string): string {
    return name
        .replace(/[A-Z]/g, (char) => `_${char}`)
        .replace(/^_/, '')
        .toUpperCase();
}

export function enumJsonName(desc: DescEnum, value: number): string {
    const valueDesc = desc.value[value];
    if (!valueDesc) {
        return String(value);
    }

    const prefix = `${toUpperSnake(desc.name)}_`;
    const name = valueDesc.name.startsWith(prefix)
        ? valueDesc.name.slice(prefix.length)
        : valueDesc.name;
    return name.toLowerCase();
}

function throwInvalidEnum(path: string): never {
    throw new ApiRequestError(
        400,
        'invalid_param',
        `${path} 必须是有效的枚举值`
    );
}

function resolveEnumNumber(
    desc: DescEnum,
    jsonValue: unknown,
    path: string
): number {
    if (typeof jsonValue === 'number') {
        return jsonValue;
    }

    if (typeof jsonValue !== 'string') {
        throwInvalidEnum(path);
    }

    const text = jsonValue;
    const direct = Object.values(desc.value).find(
        (value) => value.name === text
    );
    if (direct) {
        return direct.number;
    }

    const lowerText = text.toLowerCase();
    const mapped = Object.values(desc.value).find(
        (value) => enumJsonName(desc, value.number) === lowerText
    );
    if (mapped) {
        return mapped.number;
    }

    throwInvalidEnum(path);
}

function normalizeFieldValue(
    field: DescField,
    jsonValue: unknown,
    path: string
): unknown {
    switch (field.fieldKind) {
        case 'enum':
            return resolveEnumNumber(field.enum, jsonValue, path);
        case 'message': {
            return normalizeMessageValue(field.message, jsonValue, path);
        }
        case 'list': {
            if (!Array.isArray(jsonValue)) {
                return jsonValue;
            }

            return jsonValue.map((item, index) => {
                const itemPath = `${path}[${index}]`;
                switch (field.listKind) {
                    case 'enum':
                        return resolveEnumNumber(field.enum, item, itemPath);
                    case 'message':
                        return normalizeMessageValue(
                            field.message,
                            item,
                            itemPath
                        );
                    default:
                        return item;
                }
            });
        }
        case 'map': {
            if (
                jsonValue === null ||
                typeof jsonValue !== 'object' ||
                Array.isArray(jsonValue)
            ) {
                return jsonValue;
            }

            const objectValue = jsonValue as Record<string, unknown>;
            const normalized: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(objectValue)) {
                const valuePath = `${path}[${key}]`;
                switch (field.mapKind) {
                    case 'enum':
                        normalized[key] = resolveEnumNumber(
                            field.enum,
                            value,
                            valuePath
                        );
                        break;
                    case 'message':
                        normalized[key] = normalizeMessageValue(
                            field.message,
                            value,
                            valuePath
                        );
                        break;
                    default:
                        normalized[key] = value;
                        break;
                }
            }
            return normalized;
        }
        default:
            return jsonValue;
    }
}

function normalizeMessageValue(
    schema: DescMessage,
    jsonValue: unknown,
    path: string
): unknown {
    if (
        schema.typeName === 'google.protobuf.Struct' ||
        schema.typeName === 'google.protobuf.Value' ||
        schema.typeName === 'google.protobuf.ListValue'
    ) {
        return jsonValue;
    }

    if (
        jsonValue === null ||
        typeof jsonValue !== 'object' ||
        Array.isArray(jsonValue)
    ) {
        return jsonValue;
    }

    const objectValue = jsonValue as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(objectValue)) {
        const field = schema.fields.find(
            (candidate) => candidate.jsonName === key || candidate.name === key
        );
        normalized[key] = field
            ? normalizeFieldValue(
                  field,
                  value,
                  path.length === 0 ? key : `${path}.${key}`
              )
            : value;
    }
    return normalized;
}

export function normalizeRequestJsonEnums(
    schema: DescMessage,
    jsonValue: unknown
): unknown {
    return normalizeMessageValue(schema, jsonValue, '');
}

function validateMessageEnums(
    desc: DescMessage,
    message: Message,
    path: string
) {
    const msg = reflect(desc, message as never);

    for (const field of msg.sortedFields) {
        if (!msg.isSet(field)) {
            continue;
        }

        const value = msg.get(field);
        switch (field.fieldKind) {
            case 'enum': {
                const numericValue = value as number;
                if (field.enum.value[numericValue] === undefined) {
                    throwInvalidEnum(
                        path.length === 0
                            ? field.jsonName
                            : `${path}.${field.jsonName}`
                    );
                }
                break;
            }
            case 'message': {
                if (
                    field.message.typeName !== 'google.protobuf.Struct' &&
                    field.message.typeName !== 'google.protobuf.Value' &&
                    field.message.typeName !== 'google.protobuf.ListValue'
                ) {
                    validateMessageEnums(
                        field.message,
                        (value as { message: Message }).message,
                        `${path}.${field.jsonName}`
                    );
                }
                break;
            }
            case 'list': {
                let index = 0;
                for (const item of value as Iterable<unknown>) {
                    if (field.listKind === 'enum') {
                        const numericValue = item as number;
                        if (field.enum.value[numericValue] === undefined) {
                            throwInvalidEnum(
                                `${path.length === 0 ? field.jsonName : `${path}.${field.jsonName}`}[${index}]`
                            );
                        }
                    } else if (field.listKind === 'message') {
                        validateMessageEnums(
                            field.message,
                            (item as { message: Message }).message,
                            `${path}[${index}]`
                        );
                    }
                    index += 1;
                }
                break;
            }
            case 'map': {
                for (const [key, item] of value as ReadonlyMap<
                    unknown,
                    unknown
                >) {
                    if (field.mapKind === 'enum') {
                        const numericValue = item as number;
                        if (field.enum.value[numericValue] === undefined) {
                            throwInvalidEnum(
                                `${path.length === 0 ? field.jsonName : `${path}.${field.jsonName}`}[${String(key)}]`
                            );
                        }
                    } else if (field.mapKind === 'message') {
                        validateMessageEnums(
                            field.message,
                            (item as { message: Message }).message,
                            `${path}[${String(key)}]`
                        );
                    }
                }
                break;
            }
            default:
                break;
        }
    }
}

export function validateRequestMessageEnums(
    schema: DescMessage,
    message: Message
) {
    validateMessageEnums(schema, message, '');
}
