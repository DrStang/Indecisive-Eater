import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';


export function signToken(userId: number) {
    return jwt.sign({ sub: userId }, process.env.JWT_SECRET!, { expiresIn: '30d' });
}


export function requireAuth(req: Request & { userId?: number }, res: Response, next: NextFunction) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    try {
        if (!token) return res.status(401).json({ error: 'missing token' });
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
        req.userId = Number(payload.sub);
        next();
    } catch (e) {
        return res.status(401).json({ error: 'invalid token' });
    }
}
export function optionalAuth(req: Request & { userId?: number }, res: Response, next: NextFunction) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
        req.userId = undefined;
        return next();
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
        req.userId = Number(payload.sub);
    } catch (e) {
        req.userId = undefined;
    }

    next();
}