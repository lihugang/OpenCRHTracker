import { defineEventHandler } from 'h3';
import { getOidcJwks } from '~/server/utils/oauth/jwks';

export default defineEventHandler(() => getOidcJwks());
