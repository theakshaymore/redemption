import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import { json } from "express";

const generateAccessAndRefreshTokens = async (userId) => {
  //
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "SOMETHING WENT WRONG WHILE GENERATING REFRESH AND ACCESS TOKEN"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  // SECTION: get user details from user
  const { fullName, email, username, password } = req.body;

  // SECTION: check for validation - not empty
  // if (fullName === '') {
  //   throw new ApiError(400, "Fullname field is required")
  // }

  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "SOME FIELD ARE MISSING");
  }

  // SECTION: check if user already exist
  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (existedUser) {
    throw new ApiError(409, "USER WITH USERNAME OR EMAIL IS ALREADY EXIST");
  }

  // SECTION: check fro images - avatar
  const avatarLocalPath = req.files?.avatar[0]?.path;
  if (!avatarLocalPath) {
    throw new ApiError(400, "AVATAR IS REQUIRED");
  }

  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  // SECTION: upload to cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "AVATAR IS REQUIRED");
  }

  // SECTION: create user object
  const user = await User.create({
    fullName,
    email,
    password,
    username: username.toLowerCase(),
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
  });

  // SECTION: remove password and refresh token
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // SECTION: check for user creation
  if (!createdUser) {
    throw new ApiError(500, "SOMETHING WENT WRONG WHILE REGISTERING NEW USER");
  }

  // SECTION: return response
  return res
    .status(201)
    .json(new ApiResponse(201, createdUser, "USER REGISTERED SUCCESSFULLY !!"));
});

const loginUser = asyncHandler(async (req, res) => {
  // SECTION: get the data from user
  const { username, email, password } = req.body;
  console.log(username, email, password);

  // SECTION: check for empty value
  if (!username || !email) {
    throw new ApiError(400, "EMAIL & PASSWORD FIELD REQUIRED");
  }

  // SECTION: check if user already exist or not
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "USER WITH USERNAME OR EMAIL DOESNT EXIST");
  }

  // SECTION: password check
  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "INVALID USER CREDENTIALS");
  }

  // SECTION: access and refresh token
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // SECTION: send cookie
  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "USER LOGGED IN SUCCESSFULLY !!"
      )
    );

  // SECTION: send response
  res.send(user);
});

const logoutUser = asyncHandler(async (req, res) => {
  //
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully !!"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  // get token from cookie
  const incomingRefreshToken = req.cookies.accessToken || req.body.accessToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "UNAUTHORIZED REQUEST");
  }

  try {
    //verify token
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    // find user based on token
    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "INVALID REFRESH TOKEN");
    }

    // verify accessToken with refreshToken
    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "REFRESH TOKEN IS EXPIRED OR USED");
    }

    // generate new token
    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    // send token
    return (
      res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options),
      json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "ACCESS TOKEN REFRESHED !!!"
        )
      )
    );
  } catch (error) {
    throw new ApiError(401, error?.message || "INVALID REFRESH TOKEN");
  }
});

export { registerUser, loginUser, logoutUser, refreshAccessToken };
