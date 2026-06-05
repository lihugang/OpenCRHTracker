import type { DocsContentSection } from './deployDocs';

export const oauthFlowOverview = [
    '登录 Open CRH Tracker 账号并创建 OAuth 客户端，登记回调地址并申请所需 scope。',
    '普通用户需要等待 scope 审核通过后才能授权；客户端创建者可在 scope 仍为待审核时先行测试自己的客户端。',
    '用户在浏览器完成登录与授权确认，应用在回调地址收到 authorization code。',
    '应用调用 /oauth/token 换取 access_token 和 id_token，再按 Bearer 方式访问 /oauth/userinfo。'
];

const createClientRequestExample = [
    'curl -X POST /api/v1/oauth/clients \\',
    "    -H 'Content-Type: application/json' \\",
    "    -H 'Cookie: token=<你的网页登录会话>' \\",
    "    --data '{",
    '        "name": "My Transit App",',
    '        "description": "Open CRH Tracker OAuth demo",',
    '        "homepageUrl": "https://app.example.com",',
    '        "redirectUris": [',
    '            "https://app.example.com/oauth/callback"',
    '        ],',
    '        "requestedScopes": [',
    '            "api.auth.me.read"',
    '        ]',
    "    }'"
].join('\n');

const authorizeUrlExample = [
    '/oauth/authorize',
    '    ?response_type=code',
    '    &client_id=client_123',
    '    &redirect_uri=https%3A%2F%2Fapp.example.com%2Foauth%2Fcallback',
    '    &scope=api.auth.me.read',
    '    &state=9f4f1c8c4d5a4f43',
    '    &code_challenge=7w7Tt39Qn1m6M5Lx9c1xQ1kBrmR8J4t9wL4mUt5M2pU',
    '    &code_challenge_method=S256',
    '    &nonce=b2d0f7a1c81e41d7'
].join('\n');

const tokenExchangeExample = [
    'curl -X POST /oauth/token \\',
    "    -H 'Content-Type: application/x-www-form-urlencoded' \\",
    "    --data-urlencode 'grant_type=authorization_code' \\",
    "    --data-urlencode 'client_id=client_123' \\",
    "    --data-urlencode 'code=<回调中的 code>' \\",
    "    --data-urlencode 'redirect_uri=https://app.example.com/oauth/callback' \\",
    "    --data-urlencode 'code_verifier=<浏览器里保存的 code_verifier>'"
].join('\n');

const callbackSuccessUrlExample = [
    'https://app.example.com/oauth/callback',
    '    ?code=SplxlOBeZQQYbYS6WxSbIA',
    '    &state=9f4f1c8c4d5a4f43'
].join('\n');

const callbackFailureUrlExample = [
    'https://app.example.com/oauth/callback',
    '    ?error=access_denied',
    '    &state=9f4f1c8c4d5a4f43'
].join('\n');

const tokenResponseExample = [
    '{',
    '    "access_token": "ocrh_u_xxxxxxxxxxxxxxxxxxxx",',
    '    "token_type": "Bearer",',
    '    "expires_in": 7200,',
    '    "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Im9jcmgta2V5LTEifQ...",',
    '    "scope": "api.auth.me.read"',
    '}'
].join('\n');

const userInfoExample = [
    'curl /oauth/userinfo \\',
    "    -H 'Authorization: Bearer <access_token>'"
].join('\n');

const userInfoResponseExample = [
    '{',
    '    "sub": "dGhpcy1pcy1hLXN0YWJsZS1vaWRjLXN1YmplY3Q"',
    '}',
    '',
    '{',
    '    "sub": "dGhpcy1pcy1hLXN0YWJsZS1vaWRjLXN1YmplY3Q",',
    '    "preferred_username": "demo-user"',
    '}'
].join('\n');

export const oauthDocsSections: DocsContentSection[] = [
    {
        id: 'overview',
        title: '这份授权是怎么工作的',
        summary:
            '本站当前使用授权码模式完成登录授权，并用 PKCE 保护授权过程。',
        blocks: [
            {
                type: 'list',
                title: '当前能力',
                items: [
                    '授权模式固定为 Authorization Code，response_type 只能使用 code。',
                    'PKCE 为必需项，code_challenge_method 当前仅支持 S256。',
                    '令牌交换成功后返回 access_token、id_token、expires_in 和 scope。',
                    '当前没有 refresh_token；access_token 过期后需要重新发起授权流程。'
                ]
            },
            {
                type: 'field-cards',
                title: '核心端点',
                cards: [
                    {
                        path: '/oauth/authorize',
                        valueType: 'GET',
                        required: true,
                        description:
                            '浏览器跳转入口。用户会在这里完成登录、授权确认，并最终被重定向到注册过的 redirect_uri。'
                    },
                    {
                        path: '/oauth/token',
                        valueType: 'POST',
                        required: true,
                        description:
                            '授权码交换端点。客户端提交 authorization code 与 code_verifier 后在这里换取 access_token 和 id_token。'
                    },
                    {
                        path: '/oauth/userinfo',
                        valueType: 'GET',
                        required: true,
                        description:
                            '用户信息端点。应用拿到 access_token 后可在这里读取 OIDC sub，若 scope 允许还会返回 preferred_username。'
                    }
                ]
            },
        ]
    },
    {
        id: 'client',
        title: '先创建 OAuth 客户端',
        summary: '',
        blocks: [
            {
                type: 'paragraph',
                text: '先登录站内账号，然后点击右上角用户名进入设置页，选择开发选项卡，切换面板到 OAuth 页，填写信息创建 OAuth 客户端。'
            },
            {
                type: 'field-cards',
                title: '创建时要准备的信息',
                cards: [
                    {
                        path: 'name',
                        valueType: 'string',
                        required: true,
                        description: '客户端显示名称，会出现在授权确认页。'
                    },
                    {
                        path: 'redirectUris',
                        valueType: 'string[]',
                        required: true,
                        description:
                            '允许回调的地址列表。授权请求里的 redirect_uri 必须与这里的某一项完全一致。'
                    },
                    {
                        path: 'requestedScopes',
                        valueType: 'string[]',
                        required: true,
                        description:
                            '客户端希望申请的 scope 列表。只有审核通过的 scope 才能在授权请求中使用。'
                    },
                    {
                        path: 'description',
                        valueType: 'string | null',
                        description: '可选描述，便于用户理解该应用用途。'
                    },
                    {
                        path: 'homepageUrl',
                        valueType: 'string | null',
                        description: '可选主页地址，用于开发者识别和后续管理。'
                    }
                ]
            },
            {
                type: 'paragraph',
                text: '客户端创建成功后，普通用户需要等待管理员审核 scope；客户端创建者可在自己客户端的 scope 仍为待审核时继续完成 OAuth 登录与授权测试。'
            }
        ]
    },
    {
        id: 'authorize',
        title: '发起授权请求',
        summary: '第三方应用应在浏览器里发起授权。',
        blocks: [
            {
                type: 'field-cards',
                title: '授权请求参数',
                cards: [
                    {
                        path: 'response_type',
                        valueType: 'string',
                        required: true,
                        description: '固定填写 code。'
                    },
                    {
                        path: 'client_id',
                        valueType: 'string',
                        required: true,
                        description: '创建客户端后分配的 client_id。'
                    },
                    {
                        path: 'redirect_uri',
                        valueType: 'string',
                        required: true,
                        description:
                            '授权完成后的回调地址，必须与注册列表里的某一项完全匹配。'
                    },
                    {
                        path: 'scope',
                        valueType: 'space-delimited string',
                        required: true,
                        description: '空格分隔的 scope 列表。'
                    },
                    {
                        path: 'state',
                        valueType: 'string',
                        required: true,
                        description: '建议填写一个随机字符串。发起授权时先把它保存起来，等回调回来后再对比返回值是否一致，用来确认这次回调确实是你自己刚才发起的那次请求。'
                    },
                    {
                        path: 'code_challenge',
                        valueType: 'string',
                        required: true,
                        description: '由 code_verifier 经过 SHA-256 和 Base64URL 计算得到的 PKCE challenge。'
                    },
                    {
                        path: 'code_challenge_method',
                        valueType: 'string',
                        required: true,
                        description: '固定填写 S256。当前实现不接受 plain。'
                    },
                    {
                        path: 'nonce',
                        valueType: 'string',
                        description: '可选。建议填写一个随机字符串并在本地保存；如果这次登录返回了 id_token，再检查里面带回来的 nonce 是否和你最初保存的一致，用来确认这份身份结果确实对应当前这次请求。'
                    }
                ]
            },
            {
                type: 'code',
                title: '授权 URL 示例',
                language: 'text',
                code: authorizeUrlExample
            },
        ]
    },
    {
        id: 'token',
        title: '处理回调并交换令牌',
        summary:
            '应用在回调地址拿到 code 后，应先检查返回的 state 是否和发起授权前保存的一致，再用同一个 redirect_uri 和原始 PKCE verifier 换取令牌。',
        blocks: [
            {
                type: 'list',
                title: '回调处理要点',
                items: [
                    '先检查回调里是否带有 error；常见拒绝值为 access_denied。',
                    '把回调里的 state 和你发起授权前保存的随机值逐字对比；只有完全一致，才能继续处理这次登录结果。',
                    '确保 token 交换时使用的 redirect_uri 与授权阶段完全一致。',
                    'code 是一次性的，过期或已消费后再次提交会收到 invalid_grant。'
                ]
            },
            {
                type: 'code',
                title: '成功回调 URL 示例',
                language: 'text',
                code: callbackSuccessUrlExample
            },
            {
                type: 'code',
                title: '失败回调 URL 示例',
                language: 'text',
                code: callbackFailureUrlExample
            },
            {
                type: 'field-cards',
                title: 'POST /oauth/token 请求体',
                text: '当前服务端会从请求体读取这些字段。建议使用 application/x-www-form-urlencoded 提交，这是 OAuth 2.0 中 token 交换最常见的提交方式。',
                cards: [
                    {
                        path: 'grant_type',
                        valueType: 'string',
                        required: true,
                        description: '固定填写 authorization_code。'
                    },
                    {
                        path: 'code',
                        valueType: 'string',
                        required: true,
                        description: '回调参数中的 authorization code。'
                    },
                    {
                        path: 'client_id',
                        valueType: 'string',
                        required: true,
                        description: '与你的 OAuth 客户端对应的 client_id。'
                    },
                    {
                        path: 'redirect_uri',
                        valueType: 'string',
                        required: true,
                        description: '必须与授权阶段提交的 redirect_uri 完全一致。'
                    },
                    {
                        path: 'code_verifier',
                        valueType: 'string',
                        required: true,
                        description: '这是第三方 App 在发起授权前随机生成并保存在本地的一串字符串。服务端会用它与之前提交的 code_challenge 做校验。'
                    }
                ]
            },
            {
                type: 'code',
                title: 'cURL 交换令牌示例',
                language: 'bash',
                code: tokenExchangeExample
            },
            {
                type: 'code',
                title: '成功响应示例',
                language: 'json',
                code: tokenResponseExample
            },
        ]
    },
    {
        id: 'userinfo',
        title: '使用 access_token',
        summary:
            '拿到 access_token 后，第三方应用可以按 Bearer Token 访问当前用户相关接口。',
        blocks: [
            {
                type: 'linked-paragraph',
                textBefore: '更多 API 请见 ',
                linkText: 'API 文档',
                to: '/docs/api',
                textAfter: '。'
            },
            {
                type: 'code',
                title: '请求 userinfo',
                language: 'bash',
                code: userInfoExample
            },
            {
                type: 'paragraph',
                text: 'userinfo 至少会返回 sub。只有当授权 scope 中包含 api.auth.me.read 时，服务端才会额外返回 preferred_username。id_token 里的身份信息也遵循相同约束，因此不要假设用户名字段一定存在。'
            },
            {
                type: 'code',
                title: 'userinfo 响应示例',
                language: 'json',
                code: userInfoResponseExample
            },
            {
                type: 'list',
                title: 'id_token 说明',
                items: [
                    'id_token 由服务端使用 RS256 签名，包含 iss、sub、aud、azp、exp、iat、auth_time 和 at_hash。',
                    '如果授权请求里提供了 nonce，服务端会把它写回 id_token；第三方 App 收到后应把它和自己发起请求前保存的值做对比，确认这份身份结果确实属于当前这一次登录。',
                    'preferred_username 只有在 scope 允许读取当前身份信息时才会出现。'
                ]
            }
        ]
    },
    {
        id: 'troubleshooting',
        title: '限制与排障',
        summary:
            '多数接入失败都来自 scope 审核、redirect_uri 不匹配或 PKCE 参数错误。',
        blocks: [
            {
                type: 'list',
                title: '当前限制',
                items: [
                    '仅支持 Authorization Code，不支持 implicit、device code 或 client credentials。',
                    '仅支持 PKCE S256，不支持 plain。',
                    '当前没有 refresh_token，过期后需要重新授权。',
                    '请求里的所有 scope 必须全部审核通过，否则授权阶段直接失败。'
                ]
            },
            {
                type: 'list',
                title: '常见失败原因',
                items: [
                    'invalid_request：缺失必填字段、response_type 不是 code，或 code_challenge_method 不是 S256。',
                    'access_denied：用户拒绝授权，或者当前登录用户本身没有被请求的 scope。',
                    'invalid_grant：authorization code 已过期、已被消费、redirect_uri 不一致，或 code_verifier 校验失败。',
                    '回调后直接失败：通常是 state 对比不一致，说明这次回调不是当前这次授权请求的结果，或者浏览器本地保存的值已经丢失。'
                ]
            },
            {
                type: 'list',
                title: '安全建议',
                items: [
                    '始终生成高熵 state 和 code_verifier，并把它们只保存在短期会话存储中。',
                    '只通过 HTTPS 传输 access_token，避免把令牌写进 URL、日志或前端埋点。',
                    '公共客户端不要尝试长期缓存 access_token；过期后直接重新走授权码流程。',
                    '如果你的应用只需要识别登录用户身份，优先申请最小 scope，避免过度请求接口权限。'
                ]
            }
        ]
    }
];
