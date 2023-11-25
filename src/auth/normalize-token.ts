import { Logger } from '@nestjs/common';

export const normalizeToken = (token: string) => {
    return token.replace(/["']/g, '').replace('Bearer ', '');
};
