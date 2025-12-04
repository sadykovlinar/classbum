// backend/controllers/parentAuthController.js
import {
  createParent,
  getChildrenForParent,
  verifyParentCredentials,
} from "../services/parentAuthService.js";
import { signParentToken } from "../utils/auth.js";

function buildAuthResponse(parent) {
  const token = signParentToken(parent);
  return {
    parent: {
      id: parent.id,
      email: parent.email,
      name: parent.name,
      phone: parent.phone,
      notify_channel: parent.notify_channel,
    },
    token,
  };
}

export async function registerParent(req, res) {
  try {
    const { email, password, name, phone } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "missing_email_or_password" });
    }

    try {
      const parent = await createParent({ email, password, name, phone });
      return res.json(buildAuthResponse(parent));
    } catch (err) {
      if (err.code === "email_in_use") {
        return res.status(400).json({ error: "email_in_use" });
      }
      throw err;
    }
  } catch (error) {
    console.error("register-parent error:", error);
    return res.status(500).json({ error: "server_error" });
  }
}

export async function loginParent(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "missing_email_or_password" });
    }

    const parent = await verifyParentCredentials({ email, password });

    if (!parent) {
      return res.status(401).json({ error: "invalid_credentials" });
    }

    return res.json(buildAuthResponse(parent));
  } catch (error) {
    console.error("login-parent error:", error);
    return res.status(500).json({ error: "server_error" });
  }
}

export async function getMe(req, res) {
  try {
    const parent = req.parent;
    const children = await getChildrenForParent(parent.id);

    return res.json({
      parent: {
        id: parent.id,
        email: parent.email,
        name: parent.name,
        phone: parent.phone,
        notify_channel: parent.notify_channel,
      },
      children,
    });
  } catch (error) {
    console.error("/me error:", error);
    return res.status(500).json({ error: "server_error" });
  }
}
