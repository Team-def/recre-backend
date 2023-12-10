import { SessionGuardWithDB } from './session.guard';

describe('SessionGuardWithDB', () => {
    it('should be defined', () => {
        expect(new SessionGuardWithDB()).toBeDefined();
    });
});
