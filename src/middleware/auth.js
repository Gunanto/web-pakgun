function ensureAuth(req, res, next) {
  if (!req.user) {
    req.session.flash = { type: 'error', message: 'Silakan login terlebih dahulu.' };
    return res.redirect('/admin/login');
  }
  next();
}

function ensureRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      req.session.flash = { type: 'error', message: 'Anda tidak memiliki akses ke halaman ini.' };
      return res.redirect('/admin/dashboard');
    }
    next();
  };
}

module.exports = {
  ensureAuth,
  ensureRole,
};
