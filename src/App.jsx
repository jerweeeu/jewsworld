                                required
                              />

                              <button
                                aria-label="Send comment"
                                className="send-button"
                              >
                                <Send size={16} />
                              </button>
                            </form>
                          ) : (
                            <button
                              className="comment-login"
                              onClick={() => setAuthOpen(true)}
                            >
                              Log in to comment
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ) : (
                    <article
                      className="memory-card photo-memory"
                      key={item.id}
                    >
                      <div className="memory-photo-wrap">
                        <img
                          src={item.photo.url}
                          alt={
                            item.photo.caption ||
                            item.post.title ||
                            'Diary photo'
                          }
                          loading="lazy"
                        />

                        <span className="photo-date">
                          {format(
                            new Date(`${item.post.entry_date}T12:00:00`),
                            'M/d'
                          )}
                        </span>
                      </div>

                      {item.post.title && (
                        <p className="photo-caption">{item.post.title}</p>
                      )}

                      {isAdmin && (
                        <button
                          className="text-button danger-text photo-delete"
                          onClick={() => deletePost(item.post)}
                        >
                          Delete photo set
                        </button>
                      )}
                    </article>
                  )
                )}
            </div>

            {activePost && (
              <div
                className="modal-backdrop"
                onMouseDown={(e) =>
                  e.target === e.currentTarget && setActivePost(null)
                }
              >
                <section className="modal note-detail">
                  <button
                    className="icon-button close"
                    onClick={() => setActivePost(null)}
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>

                  <div className="eyebrow">A LITTLE MEMORY</div>

                  <h2>{activePost.title || 'Untitled entry'}</h2>

                  <p className="note-detail-body">{activePost.body}</p>

                  <small>
                    {format(
                      new Date(`${activePost.entry_date}T12:00:00`),
                      'MMMM d, yyyy'
                    )}
                  </small>
                </section>
              </div>
            )}
          </section>
        )}

        <footer className="footer">
          Call Me If U Get Lost 
        </footer>
      </main>

      {authOpen && (
        <AuthPanel
          onClose={() => setAuthOpen(false)}
          onDone={() => setAuthOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
