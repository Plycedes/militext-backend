import { Socket as DefaultSocket } from "socket.io";
import { IUser } from "../models/user.model";

export interface AuthenticatedSocket extends DefaultSocket {
    user?: IUser;
}
