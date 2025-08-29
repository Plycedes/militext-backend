import { Request, Response, NextFunction } from "express";

const asyncHandler = <Req extends Request, Res extends Response = Response, Ret = any>(
    requestHandler: (req: Req, res: Res, next: NextFunction) => Promise<Ret>
) => {
    return (req: Req, res: Res, next: NextFunction) => {
        Promise.resolve(requestHandler(req, res, next)).catch(next);
    };
};

export { asyncHandler };
