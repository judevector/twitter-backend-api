import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

import config from "config";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();

const EMAIL_TOKEN_EXPIRATION_MS = config.get<string>("EMAIL_TOKEN_EXPIRATION_MS");
const AUTHENTICATION_EXPIRATION_HOURS = config.get<string>("AUTHENTICATION_EXPIRATION_HOURS");
const JWT_SECRET = "SUPER SECRET";

// Function to generate a random 8 digit number as the email token
const generateEmailToken = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Function to generate JWT Authentication Token
const generateJwtToken = (tokenId: Number): string => {
  const jwtPayload = { tokenId };

  return jwt.sign(jwtPayload, JWT_SECRET, {
    algorithm: "HS256",
    noTimestamp: true,
  });
};

// Create a user , if it doesn't already exist
// Generate the emailToken and send it to their email address
export const login = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const emailToken = generateEmailToken();

    const expiration = new Date(new Date().getTime() + EMAIL_TOKEN_EXPIRATION_MS);

    const createdToken = await prisma.token.create({
      data: {
        type: "EMAIL",
        emailToken,
        expiration,
        user: {
          connectOrCreate: {
            where: { email },
            create: { email, bio: "Hello I'm new on Twitter" },
          },
        },
      },
    });
    console.log(createdToken);
    // send email token to users email

    res.status(200).json({ message: "Token created successfully" });
  } catch (error) {
    res.status(500).json({ error: error });
  }
};

// Validate the emailToken
// Generate a long-lived JWT token
export const authenticate = async (req: Request, res: Response) => {
  try {
    const { email, emailToken } = req.body;
    const dbEmailToken = await prisma.token.findUnique({
      where: {
        emailToken,
      },
      include: {
        user: true,
      },
    });

    if (!dbEmailToken || !dbEmailToken.valid) {
      return res.status(401).json({ error: "Invalid Token" });
    }

    if (dbEmailToken.expiration < new Date()) {
      return res.status(401).json({ error: "Token expired" });
    }

    if (dbEmailToken?.user?.email !== email) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Validatig that the user is the owner of the email

    // Generate an API token
    const expiration = new Date(new Date().getTime() + AUTHENTICATION_EXPIRATION_HOURS);

    const apiToken = await prisma.token.create({
      data: {
        type: "API",
        expiration,
        user: {
          connect: {
            email,
          },
        },
      },
    });

    // This invalidates the token by setting the value to false
    await prisma.token.update({
      where: {
        id: dbEmailToken.id,
      },
      data: {
        valid: false,
      },
    });

    // Generate the JWT token
    const authToken = generateJwtToken(apiToken.id);

    res.status(200).json({ authToken: authToken });
  } catch (error) {
    res.status(500).json({ error: error });
  }
};
