import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.models.js";
import {
  deleteFromCloudinary,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";
const generateAccessAndRefreshTokens = async (user_id) => {
  try {
    const user = await User.findById(user_id);
    if (!user) {
      throw new ApiError(404, "User with this userid does not exists");
    }
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something Went Wrong while generating access token"
    );
  }
};
const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, username, password } = req.body;
  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All Fields are required");
  }
  const existedUser = await User.findOne({
    $or: [{ email }, { username }],
  });
  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }
  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  const coverLocalPath = req.files?.coverImage?.[0]?.path;
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar File is missing");
  }
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  if (!avatar) {
    throw new ApiError(400, "Avatar Upload failed");
  }
  let coverImage = "";
  if (coverLocalPath) {
    coverImage = await uploadOnCloudinary(coverLocalPath);
    if (!coverImage) {
      await deleteFromCloudinary(avatar.public_id);
      throw new ApiError(400, "Cover Image Upload failed");
    }
  }
  let user;
  try {
    user = await User.create({
      fullName,
      avatar: avatar.url,
      coverImage: coverImage?.url || "",
      email,
      password,
      username: username.toLowerCase(),
    });
  } catch (error) {
    console.log("User Creation Failed");
    if (avatar) {
      await deleteFromCloudinary(avatar.public_id);
    }
    if (coverImage) {
      await deleteFromCloudinary(coverImage.public_id);
    }
    throw new ApiError(500, "User Creation Failed... Deleted images");
  }
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );
  if (!createdUser) {
    throw new ApiError(500, "Something Went Wrong while registering a user");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, createdUser, "User Registered Successfully"));
});
const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;
  if (!email && !username) {
    throw new ApiError(400, "Email or username is required");
  }
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (!user) {
    throw new ApiError(404, "User Not Found");
  }
  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid Credentials");
  }
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken -avatar -coverImage"
  );
  if (!loggedInUser) {
    throw new ApiError(404, "User Not Found");
  }
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
        { user: loggedInUser, accessToken, refreshToken },
        "User Logged In Successfully"
      )
    );
});
const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingrefreshToken =
    req.cookies?.refreshToken || req.body.refreshToken;
  if (!incomingrefreshToken) {
    throw new ApiError(401, "Unauthorized Access");
  }
  try {
    const decodedToken = jwt.verify(
      incomingrefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    const user = await User.findById(decodedToken?._id);
    if (!user) {
      throw new ApiError(400, "Invalid Refresh Token");
    }
    if (incomingrefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Invalid Refresh Token");
    }
    const options = { httpOnly: true, secure: true };
    const { accessToken, refreshToken } = generateAccessAndRefreshTokens(
      user._id
    );
    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken },
          "Access Token Refreshed Successfully"
        )
      );
  } catch (error) {
    throw new ApiError(401, "Invalid Refresh Token");
  }
});
export { registerUser, loginUser, refreshAccessToken };
