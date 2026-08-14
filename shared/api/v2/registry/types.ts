import type { DescMessage } from '@bufbuild/protobuf';

export type V2ClientHttpMethod =
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'DELETE'
    | 'HEAD';

export type V2ClientBodyMode = 'none' | 'optional' | 'required';

export type V2ClientResponseKind = 'protobuf' | 'raw';

export interface V2ClientOperation<
    TRequestSchema extends DescMessage = DescMessage,
    TResponseSchema extends DescMessage = DescMessage
> {
    operationName: string;
    method: V2ClientHttpMethod;
    pathTemplate: string;
    requestSchema: TRequestSchema;
    responseSchema: TResponseSchema;
    bodyMode: V2ClientBodyMode;
    responseKind: V2ClientResponseKind;
    rawContentTypes?: readonly string[];
}
