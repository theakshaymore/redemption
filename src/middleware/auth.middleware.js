import { asyncHandler } from "../utils/asyncHandler";
import { User } from '../models/user.model'
import jwt from 'jsonwebtoken'
import {ApiError} from "../utils/ApiError"


export const verifyJWT = asyncHandler( async (req, res, next) => {

    try {
        // get the accessToken from request
        const token = req.cookies?.accessToken || 
            req.header("Authorization")?.replace('Bearer ', '')
    
        if (!token) {
            throw new ApiError(401, "Unauthorized request")
        }
    
        // verify accessToken with jwt
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
    
    
        // if the user is verified then get user details from DB
        const user = await User.findById(decodedToken?._id).select(
            '-password -refreshToken'
        )
    
        if (!user) {
            throw new ApiError(401, 'Invalid access token')
        }
    
        // attach user details to request
        req.user = user
        next()
    } catch (error) {
        throw new ApiError(401, error?.message || 'Invalid access token')
    }
})