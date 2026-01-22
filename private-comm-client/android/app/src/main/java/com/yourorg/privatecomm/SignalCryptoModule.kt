package com.yourorg.privatecomm

import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.bridge.Arguments

import java.util.HashMap
import android.util.Base64

class SignalCryptoModule(reactContext: ReactApplicationContext) : NativeModule(reactContext) {

    override fun getName(): String {
        return "SignalCrypto"
    }

    @ReactMethod
    fun generateIdentityKeyPair(promise: Promise) {
        try {
            val keyPair = Ed25519KeyPair.generate()
            val map: WritableNativeMap = Arguments.createMap()

            map.putString("publicKey", keyPair.publicKey.encodeBase64())
            map.putString("privateKey", keyPair.privateKey.encodeBase64())

            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("KEYGEN_ERROR", "Failed to generate identity key pair: ${e.message}", e)
        }
    }

    @ReactMethod
    fun generateSignedPreKey(privateKeyBase64: String, keyId: Int, promise: Promise) {
        try {
            val privateKey = Ed25519PrivateKey.decodeBase64(privateKeyBase64)
            val signedPreKey = X25519SignedPreKey.generate(privateKey, keyId)
            val map: WritableNativeMap = Arguments.createMap()

            map.putString("publicKey", signedPreKey.publicKey.encodeBase64())
            map.putString("signature", signedPreKey.signature.encodeBase64())
            map.putString("privateKey", signedPreKey.privateKey.encodeBase64())

            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("PREKEY_ERROR", "Failed to generate signed prekey: ${e.message}", e)
        }
    }

    @ReactMethod
    fun generatePreKey(keyId: Int, promise: Promise) {
        try {
            val preKey = X25519PreKey.generate(keyId)
            val map: WritableNativeMap = Arguments.createMap()

            map.putString("publicKey", preKey.publicKey.encodeBase64())
            map.putString("privateKey", preKey.privateKey.encodeBase64())

            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("PREKEY_ERROR", "Failed to generate prekey: ${e.message}", e)
        }
    }

    @ReactMethod
    fun createSession(
        identityPrivateKeyBase64: String,
        theirIdentityKeyBase64: String,
        theirSignedPreKeyBase64: String,
        theirPreKeySignatureBase64: String,
        theirOneTimePreKeyBase64: String?,
        promise: Promise
    ) {
        try {
            val identityPrivateKey = Ed25519PrivateKey.decodeBase64(identityPrivateKeyBase64)
            val theirIdentityKey = Ed25519PublicKey.decodeBase64(theirIdentityKeyBase64)
            val theirSignedPreKey = X25519SignedPreKey.decodeBase64(
                theirSignedPreKeyBase64,
                theirPreKeySignatureBase64
            )
            val theirOneTimePreKey = if (theirOneTimePreKeyBase64 != null) {
                X25519PublicKey.decodeBase64(theirOneTimePreKeyBase64)
            } else {
                null
            }

            val session = X3DHKeyExchange.perform(
                identityPrivateKey,
                theirIdentityKey,
                theirSignedPreKey,
                theirOneTimePreKey
            )

            val map: WritableNativeMap = Arguments.createMap()
            map.putString("session", session.encodeBase64())

            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("SESSION_ERROR", "Failed to create session: ${e.message}", e)
        }
    }

    @ReactMethod
    fun encrypt(sessionBase64: String, plaintext: String, promise: Promise) {
        try {
            val session = DoubleRatchetSession.decodeBase64(sessionBase64)
            val result = session.encrypt(plaintext.toByteArray(Charsets.UTF_8))

            val map: WritableNativeMap = Arguments.createMap()
            map.putInt("messageType", result.messageType)
            map.putInt("registrationId", result.registrationId)
            map.putString("ciphertext", Base64.encodeToString(result.ciphertext, Base64.NO_WRAP))
            map.putString("updatedSession", result.updatedSession.encodeBase64())

            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("ENCRYPT_ERROR", "Failed to encrypt: ${e.message}", e)
        }
    }

    @ReactMethod
    fun decrypt(
        sessionBase64: String?,
        identityPrivateKeyBase64: String,
        ciphertextBase64: String,
        messageType: Int,
        promise: Promise
    ) {
        try {
            val identityPrivateKey = Ed25519PrivateKey.decodeBase64(identityPrivateKeyBase64)
            val ciphertext = Base64.decode(ciphertextBase64, Base64.NO_WRAP)

            val session = if (sessionBase64 != null) {
                DoubleRatchetSession.decodeBase64(sessionBase64)
            } else {
                DoubleRatchetSession.initial()
            }

            val result = session.decrypt(identityPrivateKey, ciphertext, messageType)

            val map: WritableNativeMap = Arguments.createMap()
            map.putString("plaintext", String(result.plaintext, Charsets.UTF_8))
            map.putString("updatedSession", result.updatedSession.encodeBase64())

            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("DECRYPT_ERROR", "Failed to decrypt: ${e.message}", e)
        }
    }
}
