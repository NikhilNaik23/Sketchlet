const { authLoginSchema, authRegisterSchema } = require("../utils/validation");
const { loadAuthResponse, loginUser, registerUser } = require("../services/authService");

function sendValidationError(res, error) {
  return res.status(400).json({
    error: "Validation failed.",
    issues: error.issues?.map((issue) => ({ path: issue.path.join("."), message: issue.message })) || [],
  });
}

async function register(req, res) {
  const parsed = authRegisterSchema.safeParse(req.body);

  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const result = await registerUser(parsed.data);
    return res.status(201).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || "Failed to register user." });
  }
}

async function login(req, res) {
  const parsed = authLoginSchema.safeParse(req.body);

  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const result = await loginUser(parsed.data);
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || "Failed to log in." });
  }
}

async function me(req, res) {
  return res.json(await loadAuthResponse(req.authUser._id));
}

module.exports = {
  login,
  me,
  register,
};